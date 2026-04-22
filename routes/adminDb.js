const express = require('express');
const mysql   = require('mysql2/promise');
const { requireAdmin } = require('./middleware');
const { getMainPool, getPool, MAIN_DB } = require('../database');
require('dotenv').config();

const router = express.Router();

const BASE_CONFIG = {
  host:     process.env.MYSQL_HOST     || 'localhost',
  port:     parseInt(process.env.MYSQL_PORT) || 3306,
  user:     process.env.MYSQL_USER     || 'root',
  password: process.env.MYSQL_PASSWORD || '',
};

// GET /api/admin-db/databases — list databases (superadmin: all; admin: own mandi only)
router.get('/databases', requireAdmin, async (req, res) => {
  const user = req.session.user;
  try {
    if (user.level === 'superadmin') {
      const conn = await mysql.createConnection({ ...BASE_CONFIG });
      const [rows] = await conn.execute("SHOW DATABASES LIKE 'mandi%'");
      await conn.end();
      res.json({ databases: rows.map(r => Object.values(r)[0]) });
    } else {
      // Admin: only show databases for their mandi
      if (!user.mandi_id) return res.json({ databases: [] });
      const [fyRows] = await req.mainDb.execute(
        'SELECT code FROM financial_years WHERE mandi_id = ? ORDER BY created_at DESC',
        [user.mandi_id]
      );
      // Always include mandi_main for reference
      const dbs = [MAIN_DB, ...fyRows.map(r => r.code)];
      res.json({ databases: dbs });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list databases' });
  }
});

// GET /api/admin-db/tables?db=mandi_fy_2526 — list tables in a database
router.get('/tables', requireAdmin, async (req, res) => {
  const { db } = req.query;
  if (!db || !/^mandi[\w_]+$/.test(db))
    return res.status(400).json({ error: 'Invalid database name' });

  // Non-superadmin: verify this DB belongs to their mandi
  const user = req.session.user;
  if (user.level !== 'superadmin' && db !== MAIN_DB) {
    const [rows] = await req.mainDb.execute(
      'SELECT id FROM financial_years WHERE mandi_id = ? AND code = ?', [user.mandi_id, db]
    );
    if (!rows.length) return res.status(403).json({ error: 'Access denied to this database' });
  }

  try {
    const pool = getPool(db);
    const [rows] = await pool.execute('SHOW TABLES');
    const tables = rows.map(r => Object.values(r)[0]);
    res.json({ tables });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list tables' });
  }
});

// GET /api/admin-db/data?db=mandi_fy_2526&table=gate_passes&limit=100&offset=0
router.get('/data', requireAdmin, async (req, res) => {
  const { db, table, limit = 100, offset = 0 } = req.query;

  if (!db || !/^mandi[\w_]+$/.test(db))
    return res.status(400).json({ error: 'Invalid database name' });
  if (!table || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table))
    return res.status(400).json({ error: 'Invalid table name' });

  // Non-superadmin: verify this DB belongs to their mandi
  const user = req.session.user;
  if (user.level !== 'superadmin' && db !== MAIN_DB) {
    const [rows] = await req.mainDb.execute(
      'SELECT id FROM financial_years WHERE mandi_id = ? AND code = ?', [user.mandi_id, db]
    );
    if (!rows.length) return res.status(403).json({ error: 'Access denied to this database' });
  }

  const lim = Math.min(parseInt(limit) || 100, 500);
  const off = parseInt(offset) || 0;

  try {
    const pool = getPool(db);
    const [rows]  = await pool.query(`SELECT * FROM \`${table}\` LIMIT ${lim} OFFSET ${off}`);
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
    res.json({ rows, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load data' });
  }
});

// GET /api/admin-db/financial-years — list FYs (superadmin: all; admin: own mandi)
router.get('/financial-years', requireAdmin, async (req, res) => {
  const user = req.session.user;
  try {
    const whereClause = user.level === 'superadmin' ? '' : 'WHERE fy.mandi_id = ?';
    const params = user.level === 'superadmin' ? [] : [user.mandi_id];
    const [rows] = await req.mainDb.execute(
      `SELECT fy.*, m.name AS mandi_name, m.active_fy
       FROM financial_years fy LEFT JOIN mandis m ON m.id = fy.mandi_id
       ${whereClause}
       ORDER BY fy.created_at DESC`,
      params
    );
    res.json({ financial_years: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load financial years' });
  }
});

module.exports = router;
