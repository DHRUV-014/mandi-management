const mysql  = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

const BASE_CONFIG = {
  host:               process.env.MYSQL_HOST     || 'localhost',
  port:               parseInt(process.env.MYSQL_PORT) || 3306,
  user:               process.env.MYSQL_USER     || 'root',
  password:           process.env.MYSQL_PASSWORD || '',
  waitForConnections: true,
  connectionLimit:    10,
  charset:            'utf8mb4',
  // DECIMAL / SUM() results must be numbers, not strings, otherwise reduce((s,c) => s + c.val)
  // string-concatenates and every grand total in the app comes out wrong.
  decimalNumbers:     true,
};

const MAIN_DB = process.env.MYSQL_MAIN_DB || 'mandi_main';

const pools = new Map();

function getPool(dbName) {
  if (!pools.has(dbName)) {
    pools.set(dbName, mysql.createPool({ ...BASE_CONFIG, database: dbName }));
  }
  return pools.get(dbName);
}

function getMainPool() {
  return getPool(MAIN_DB);
}

// Get active FY pool for a specific mandi by mandi_id
async function getMandiFYPool(mandiId) {
  const pool = getMainPool();
  const [rows] = await pool.execute('SELECT active_fy, prefix FROM mandis WHERE id = ?', [mandiId]);
  if (!rows.length || !rows[0].active_fy) return null;
  return getPool(rows[0].active_fy);
}

// Find FY code covering a given date for a mandi (date must be YYYY-MM-DD)
async function getFYCodeForDate(mandiId, dateStr) {
  if (!mandiId || !dateStr) return null;
  const [rows] = await getMainPool().execute(
    `SELECT code FROM financial_years
     WHERE mandi_id = ? AND from_date IS NOT NULL AND to_date IS NOT NULL
       AND ? BETWEEN from_date AND to_date
     ORDER BY from_date DESC LIMIT 1`,
    [mandiId, dateStr]
  );
  return rows[0]?.code || null;
}

// Pool for the FY covering a given date (or null if no FY covers that date)
async function getFYPoolForDate(mandiId, dateStr) {
  const code = await getFYCodeForDate(mandiId, dateStr);
  return code ? { pool: getPool(code), code } : null;
}

// Verify that an FY code belongs to a given mandi (guards historical-viewing queries)
async function fyBelongsToMandi(mandiId, code) {
  if (!mandiId || !code) return false;
  const [rows] = await getMainPool().execute(
    'SELECT 1 FROM financial_years WHERE mandi_id = ? AND code = ? LIMIT 1',
    [mandiId, code]
  );
  return rows.length > 0;
}

// Get mandi info by id
async function getMandiById(mandiId) {
  const [rows] = await getMainPool().execute('SELECT * FROM mandis WHERE id = ?', [mandiId]);
  return rows[0] || null;
}

// Generate FY database name: mandi_{PREFIX_lowercase}_fy_{YEAR}
function makeFYCode(mandiPrefix, year) {
  const p = mandiPrefix.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `mandi_${p}_fy_${year}`;
}

// Get current financial year label: e.g., "2025-26"
function getCurrentFYLabel() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

// Get current FY year code: e.g., "2526" for FY 2025-26
function getCurrentFYYear() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = month >= 4 ? year : year - 1;
  return `${start}${String(start + 1).slice(-2)}`;
}

const STATE_SEEDS = [
  // 28 States
  ['Andhra Pradesh', 'AP'], ['Arunachal Pradesh', 'AR'], ['Assam', 'AS'], ['Bihar', 'BR'],
  ['Chhattisgarh', 'CG'], ['Goa', 'GA'], ['Gujarat', 'GJ'], ['Haryana', 'HR'],
  ['Himachal Pradesh', 'HP'], ['Jharkhand', 'JH'], ['Karnataka', 'KA'], ['Kerala', 'KL'],
  ['Madhya Pradesh', 'MP'], ['Maharashtra', 'MH'], ['Manipur', 'MN'], ['Meghalaya', 'ML'],
  ['Mizoram', 'MZ'], ['Nagaland', 'NL'], ['Odisha', 'OR'], ['Punjab', 'PB'],
  ['Rajasthan', 'RJ'], ['Sikkim', 'SK'], ['Tamil Nadu', 'TN'], ['Telangana', 'TS'],
  ['Tripura', 'TR'], ['Uttar Pradesh', 'UP'], ['Uttarakhand', 'UK'], ['West Bengal', 'WB'],
  // 8 Union Territories
  ['Andaman & Nicobar Islands', 'AN'], ['Chandigarh', 'CH'],
  ['Dadra & Nagar Haveli and Daman & Diu', 'DN'], ['Delhi', 'DL'],
  ['Jammu & Kashmir', 'JK'], ['Ladakh', 'LA'], ['Lakshadweep', 'LD'], ['Puducherry', 'PY'],
];

async function createFYDatabase(fyCode) {
  const rootConn = await mysql.createConnection({ ...BASE_CONFIG });
  await rootConn.execute(`CREATE DATABASE IF NOT EXISTS \`${fyCode}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await rootConn.end();

  const pool = getPool(fyCode);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS commodities (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(120) UNIQUE NOT NULL,
      unit       VARCHAR(30)  NOT NULL,
      short_name VARCHAR(30)  UNIQUE NOT NULL
    ) CHARACTER SET utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS traders (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      trader_name    VARCHAR(200) NOT NULL,
      shop_number    VARCHAR(30)  UNIQUE NOT NULL,
      license_number VARCHAR(60)  UNIQUE NOT NULL,
      phone_number   VARCHAR(30),
      status         VARCHAR(20)  NOT NULL DEFAULT 'active'
    ) CHARACTER SET utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS vehicle_types (
      id      INT AUTO_INCREMENT PRIMARY KEY,
      name    VARCHAR(100)   UNIQUE NOT NULL,
      charges DECIMAL(10,2)  NOT NULL DEFAULT 0
    ) CHARACTER SET utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS state_codes (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      state_name VARCHAR(100) NOT NULL,
      state_code VARCHAR(5)   UNIQUE NOT NULL
    ) CHARACTER SET utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS gate_passes (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      gate_pass_number VARCHAR(20)  UNIQUE NOT NULL,
      trader_id        INT          NOT NULL,
      vehicle_type_id  INT,
      vehicle_number   VARCHAR(20),
      state_code       VARCHAR(5),
      state_name       VARCHAR(100),
      builty_no        VARCHAR(50),
      created_at       DATETIME     DEFAULT NOW()
    ) CHARACTER SET utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS gate_pass_items (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      gate_pass_id   INT           NOT NULL,
      trader_id      INT,
      commodity_id   INT           NOT NULL,
      unit           VARCHAR(30)   NOT NULL,
      number_of_bags INT           NOT NULL,
      weight_per_bag DECIMAL(10,3) NOT NULL DEFAULT 0
    ) CHARACTER SET utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS commodity_rates (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      date         DATE          NOT NULL,
      commodity_id INT           NOT NULL,
      rate         DECIMAL(10,2) NOT NULL,
      created_at   DATETIME      DEFAULT NOW(),
      UNIQUE KEY uq_date_commodity (date, commodity_id)
    ) CHARACTER SET utf8mb4
  `);

  // Seed state codes
  const [[{ cnt }]] = await pool.execute('SELECT COUNT(*) AS cnt FROM state_codes');
  if (cnt === 0) {
    for (const [name, code] of STATE_SEEDS) {
      await pool.execute('INSERT IGNORE INTO state_codes (state_name, state_code) VALUES (?, ?)', [name, code]);
    }
  }

  console.log(`FY database created: ${fyCode}`);
  return pool;
}

async function initMainDB() {
  const rootConn = await mysql.createConnection({ ...BASE_CONFIG });
  await rootConn.execute(`CREATE DATABASE IF NOT EXISTS \`${MAIN_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await rootConn.end();

  const pool = getMainPool();

  // Users table — level: superadmin / admin / user
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      username      VARCHAR(50)  UNIQUE NOT NULL,
      password_hash VARCHAR(100) NOT NULL,
      level         VARCHAR(20)  NOT NULL DEFAULT 'user',
      mandi_id      INT          NULL,
      created_at    DATETIME     DEFAULT NOW()
    ) CHARACTER SET utf8mb4
  `);

  // Add mandi_id column if upgrading from older schema
  try {
    await pool.execute('ALTER TABLE users ADD COLUMN mandi_id INT NULL');
  } catch (_) { /* already exists */ }

  // Add prefix column to mandis if upgrading
  try {
    await pool.execute("ALTER TABLE mandis ADD COLUMN prefix VARCHAR(10) UNIQUE NOT NULL DEFAULT 'XX'");
  } catch (_) { /* already exists */ }

  // Normalise legacy levels
  await pool.execute("UPDATE users SET level = 'user' WHERE level NOT IN ('superadmin','admin','user')");

  // Add mandi_id to financial_years if upgrading from older schema
  try {
    await pool.execute('ALTER TABLE financial_years ADD COLUMN mandi_id INT NULL');
  } catch (_) { /* already exists */ }

  // Mandis table — one row per mandi
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS mandis (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      name          VARCHAR(200)  NOT NULL,
      prefix        VARCHAR(10)   UNIQUE NOT NULL,
      address_line1 VARCHAR(200),
      address_line2 VARCHAR(200),
      phone         VARCHAR(30),
      license_no    VARCHAR(60),
      active_fy     VARCHAR(60),
      created_at    DATETIME      DEFAULT NOW()
    ) CHARACTER SET utf8mb4
  `);

  // User–mandi assignments (many-to-many; allows one admin to manage multiple mandis)
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_mandis (
      user_id  INT NOT NULL,
      mandi_id INT NOT NULL,
      PRIMARY KEY (user_id, mandi_id)
    ) CHARACTER SET utf8mb4
  `);

  // Granular feature permissions per user (JSON array; NULL = default for that level)
  try { await pool.execute('ALTER TABLE users ADD COLUMN permissions TEXT NULL'); } catch (_) {}

  // Financial years registry
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS financial_years (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      mandi_id   INT         NOT NULL,
      code       VARCHAR(60) NOT NULL,
      fy_label   VARCHAR(20),
      from_date  DATE        NULL,
      to_date    DATE        NULL,
      created_at DATETIME    DEFAULT NOW(),
      UNIQUE KEY uq_mandi_code (mandi_id, code)
    ) CHARACTER SET utf8mb4
  `);

  // Migrations for existing financial_years table
  try { await pool.execute('ALTER TABLE financial_years ADD COLUMN from_date DATE NULL'); } catch (_) {}
  try { await pool.execute('ALTER TABLE financial_years ADD COLUMN to_date DATE NULL'); } catch (_) {}

  // Seed superadmin if no users exist
  const [[{ cnt: userCnt }]] = await pool.execute('SELECT COUNT(*) AS cnt FROM users');
  if (userCnt === 0) {
    const hash = await bcrypt.hash('superadmin123', 10);
    await pool.execute(
      "INSERT INTO users (username, password_hash, level, mandi_id) VALUES (?, ?, 'superadmin', NULL)",
      ['superadmin', hash]
    );
    console.log('Seeded superadmin user: superadmin / superadmin123');
  }

  // Patch all existing FY databases with any missing state codes from the master seed list
  try {
    const [fyRows] = await pool.execute('SELECT DISTINCT code FROM financial_years');
    for (const { code } of fyRows) {
      const fyPool = getPool(code);
      for (const [name, sc] of STATE_SEEDS) {
        await fyPool.execute(
          'INSERT IGNORE INTO state_codes (state_name, state_code) VALUES (?, ?)', [name, sc]
        );
      }
    }
    if (fyRows.length) console.log(`State codes patched in ${fyRows.length} FY database(s)`);
  } catch (_) { /* FY DBs may not exist yet — safe to ignore */ }

  console.log('Main database initialised');
}

module.exports = {
  getPool,
  getMainPool,
  getMandiFYPool,
  getMandiById,
  getFYCodeForDate,
  getFYPoolForDate,
  fyBelongsToMandi,
  createFYDatabase,
  initMainDB,
  makeFYCode,
  getCurrentFYLabel,
  getCurrentFYYear,
  STATE_SEEDS,
  MAIN_DB,
};
