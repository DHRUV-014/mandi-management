const express = require('express');
const db = require('../database');
const { requireAuth } = require('./middleware');

const router = express.Router();

// Helper: parse and validate date range
function parseDateRange(req) {
  const { from, to } = req.query;
  if (!from || !to) return { error: 'Both from and to dates are required' };
  return { from, to };
}

// Gate Pass Wise Report — full detail with items
router.get('/gate-pass', requireAuth, (req, res) => {
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ error: range.error });

  const passes = db.prepare(`
    SELECT
      gp.id,
      gp.gate_pass_number,
      gp.created_at,
      gp.vehicle_number,
      gp.state_name,
      vt.name    AS vehicle_type_name,
      vt.charges AS vehicle_charges
    FROM gate_passes gp
    LEFT JOIN vehicle_types vt ON vt.id = gp.vehicle_type_id
    WHERE DATE(gp.created_at) BETWEEN ? AND ?
    ORDER BY gp.gate_pass_number
  `).all(range.from, range.to);

  const itemStmt = db.prepare(`
    SELECT
      gpi.number_of_bags,
      gpi.weight_per_bag,
      gpi.unit,
      ROUND(gpi.number_of_bags * gpi.weight_per_bag, 2) AS total_weight,
      t.trader_name,
      t.shop_number,
      c.name       AS commodity_name,
      c.short_name
    FROM gate_pass_items gpi
    JOIN traders t     ON t.id = gpi.trader_id
    JOIN commodities c ON c.id = gpi.commodity_id
    WHERE gpi.gate_pass_id = ?
    ORDER BY gpi.id
  `);

  let grandTotalBags = 0, grandTotalWeight = 0, grandTotalCharges = 0;

  const result = passes.map(gp => {
    const items = itemStmt.all(gp.id);
    const total_bags   = items.reduce((s, it) => s + it.number_of_bags, 0);
    const total_weight = items.reduce((s, it) => s + (it.total_weight || 0), 0);
    grandTotalBags    += total_bags;
    grandTotalWeight  += total_weight;
    grandTotalCharges += (gp.vehicle_charges || 0);
    return { ...gp, items, total_bags, total_weight: Math.round(total_weight * 100) / 100 };
  });

  const summary = {
    total_passes: result.length,
    total_bags: grandTotalBags,
    total_weight: Math.round(grandTotalWeight * 100) / 100,
    total_vehicle_charges: grandTotalCharges,
  };

  res.json({ passes: result, summary });
});

// Commodity Wise Report
router.get('/commodity', requireAuth, (req, res) => {
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ error: range.error });

  const commodities = db.prepare(`
    SELECT
      c.id,
      c.name                                  AS commodity_name,
      c.short_name,
      COUNT(DISTINCT gp.id)                   AS gate_pass_count,
      COUNT(DISTINCT gpi.trader_id)           AS trader_count,
      SUM(gpi.number_of_bags)                 AS total_bags,
      ROUND(SUM(gpi.number_of_bags * gpi.weight_per_bag), 2) AS total_weight,
      gpi.unit
    FROM gate_pass_items gpi
    JOIN gate_passes gp ON gp.id = gpi.gate_pass_id
    JOIN commodities c  ON c.id = gpi.commodity_id
    WHERE DATE(gp.created_at) BETWEEN ? AND ?
    GROUP BY c.id, gpi.unit
    ORDER BY total_weight DESC
  `).all(range.from, range.to);

  const summary = {
    total_commodities: new Set(commodities.map(c => c.id)).size,
    total_bags: commodities.reduce((s, c) => s + (c.total_bags || 0), 0),
    total_weight: Math.round(commodities.reduce((s, c) => s + (c.total_weight || 0), 0) * 100) / 100,
  };

  res.json({ commodities, summary });
});

// Commodity State Wise Report
router.get('/total-arrival', requireAuth, (req, res) => {
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ error: range.error });

  const rows = db.prepare(`
    SELECT
      c.name                                                     AS commodity_name,
      c.short_name,
      COALESCE(NULLIF(gp.state_name, ''), 'Unknown')            AS state_name,
      gpi.unit,
      ROUND(SUM(gpi.number_of_bags * gpi.weight_per_bag), 2)    AS total_weight
    FROM gate_pass_items gpi
    JOIN gate_passes gp  ON gp.id  = gpi.gate_pass_id
    JOIN commodities c   ON c.id   = gpi.commodity_id
    WHERE DATE(gp.created_at) BETWEEN ? AND ?
    GROUP BY c.id, gp.state_name, gpi.unit
    ORDER BY c.name, state_name
  `).all(range.from, range.to);

  // Group into { commodity -> [state rows] }
  const commodityMap = new Map();
  for (const row of rows) {
    const key = row.commodity_name;
    if (!commodityMap.has(key)) {
      commodityMap.set(key, { commodity_name: key, short_name: row.short_name, states: [] });
    }
    commodityMap.get(key).states.push({
      state_name:   row.state_name,
      unit:         row.unit,
      total_weight: row.total_weight,
    });
  }

  const commodities = [...commodityMap.values()].map(c => ({
    ...c,
    grand_total: Math.round(c.states.reduce((s, r) => s + (r.total_weight || 0), 0) * 100) / 100,
  }));

  res.json({ commodities });
});

// Cash Report — vehicle type wise charges
router.get('/cash', requireAuth, (req, res) => {
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ error: range.error });

  const types = db.prepare(`
    SELECT
      vt.id,
      vt.name               AS vehicle_type,
      vt.charges             AS rate,
      COUNT(gp.id)           AS count,
      COUNT(gp.id) * vt.charges AS total_charges
    FROM gate_passes gp
    JOIN vehicle_types vt ON vt.id = gp.vehicle_type_id
    WHERE DATE(gp.created_at) BETWEEN ? AND ?
    GROUP BY vt.id
    ORDER BY total_charges DESC
  `).all(range.from, range.to);

  const summary = {
    total_vehicles: types.reduce((s, t) => s + t.count, 0),
    total_charges: types.reduce((s, t) => s + t.total_charges, 0),
    type_count: types.length,
  };

  res.json({ types, summary });
});

module.exports = router;
