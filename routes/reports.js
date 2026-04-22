const express = require('express');
const { requireAuth, requireAdmin, requireFYDB } = require('./middleware');
const router = express.Router();

function parseDateRange(req) {
  const { from, to } = req.query;
  if (!from || !to) return { error: 'Both from and to dates are required' };
  return { from, to };
}

// Gate Pass Wise Report
router.get('/gate-pass', requireAuth, requireFYDB, async (req, res) => {
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ error: range.error });

  try {
    const [rows] = await req.fyDbRead.execute(`
      SELECT
        DATE(gp.created_at)  AS date,
        gp.gate_pass_number,
        gp.vehicle_number,
        c.name               AS commodity_name,
        gpi.number_of_bags,
        gpi.weight_per_bag,
        gpi.unit
      FROM gate_pass_items gpi
      JOIN gate_passes gp ON gp.id = gpi.gate_pass_id
      JOIN commodities c  ON c.id  = gpi.commodity_id
      WHERE DATE(gp.created_at) BETWEEN ? AND ?
      ORDER BY gp.gate_pass_number, c.name
    `, [range.from, range.to]);
    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Shop Wise Gate Pass Report (with rates)
router.get('/shop-gate-pass', requireAuth, requireFYDB, async (req, res) => {
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ error: range.error });

  const shop = req.query.shop ? req.query.shop.trim() : null;
  const shopFilter = shop ? 'AND UPPER(t.shop_number) = UPPER(?)' : '';
  const params = shop ? [range.from, range.to, shop] : [range.from, range.to];

  try {
    const [rows] = await req.fyDbRead.execute(`
      SELECT
        t.shop_number,
        t.trader_name,
        DATE(gp.created_at)                                               AS date,
        gp.gate_pass_number,
        gp.vehicle_number,
        c.name                                                            AS commodity_name,
        gpi.number_of_bags,
        gpi.weight_per_bag,
        ROUND(gpi.number_of_bags * gpi.weight_per_bag, 2)                AS total_weight,
        gpi.unit,
        cr.rate,
        ROUND(gpi.number_of_bags * gpi.weight_per_bag * cr.rate, 2)     AS total_value
      FROM gate_pass_items gpi
      JOIN gate_passes gp ON gp.id  = gpi.gate_pass_id
      JOIN traders t      ON t.id   = gpi.trader_id
      JOIN commodities c  ON c.id   = gpi.commodity_id
      LEFT JOIN commodity_rates cr
             ON cr.commodity_id = gpi.commodity_id
            AND cr.date = DATE(gp.created_at)
      WHERE DATE(gp.created_at) BETWEEN ? AND ?
      ${shopFilter}
      ORDER BY t.shop_number, gp.gate_pass_number, c.name
    `, params);

    const shopMap = new Map();
    for (const row of rows) {
      if (!shopMap.has(row.shop_number)) {
        shopMap.set(row.shop_number, { shop_number: row.shop_number, trader_name: row.trader_name, entries: [], grand_weight: 0, grand_value: null });
      }
      const shop = shopMap.get(row.shop_number);
      shop.entries.push({
        date:             row.date,
        gate_pass_number: row.gate_pass_number,
        commodity_name:   row.commodity_name,
        number_of_bags:   row.number_of_bags,
        weight_per_bag:   row.weight_per_bag,
        total_weight:     row.total_weight,
        unit:             row.unit,
        vehicle_number:   row.vehicle_number || '—',
        rate:             row.rate,
        total_value:      row.total_value,
      });
      shop.grand_weight = Math.round((shop.grand_weight + (row.total_weight || 0)) * 100) / 100;
      if (row.total_value != null) shop.grand_value = Math.round(((shop.grand_value || 0) + row.total_value) * 100) / 100;
    }
    res.json({ shops: [...shopMap.values()] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Commodity Wise Report
router.get('/commodity', requireAuth, requireFYDB, async (req, res) => {
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ error: range.error });

  try {
    const [commodities] = await req.fyDbRead.execute(`
      SELECT
        c.id,
        c.name                                                              AS commodity_name,
        c.short_name,
        COUNT(DISTINCT gp.id)                                               AS gate_pass_count,
        COUNT(DISTINCT gpi.trader_id)                                       AS trader_count,
        SUM(gpi.number_of_bags)                                             AS total_bags,
        ROUND(SUM(gpi.number_of_bags * gpi.weight_per_bag), 2)             AS total_weight,
        gpi.unit,
        ROUND(AVG(cr.rate), 2)                                              AS avg_rate,
        ROUND(SUM(gpi.number_of_bags * gpi.weight_per_bag * cr.rate), 2)   AS total_value
      FROM gate_pass_items gpi
      JOIN gate_passes gp ON gp.id = gpi.gate_pass_id
      JOIN commodities c  ON c.id  = gpi.commodity_id
      LEFT JOIN commodity_rates cr
             ON cr.commodity_id = gpi.commodity_id
            AND cr.date = DATE(gp.created_at)
      WHERE DATE(gp.created_at) BETWEEN ? AND ?
      GROUP BY c.id, gpi.unit
      ORDER BY total_weight DESC
    `, [range.from, range.to]);

    const summary = {
      total_commodities: new Set(commodities.map(c => c.id)).size,
      total_bags:        commodities.reduce((s, c) => s + (c.total_bags    || 0), 0),
      total_weight:      Math.round(commodities.reduce((s, c) => s + (c.total_weight || 0), 0) * 100) / 100,
      total_value:       commodities.some(c => c.total_value != null)
        ? Math.round(commodities.reduce((s, c) => s + (c.total_value || 0), 0) * 100) / 100
        : null,
    };
    res.json({ commodities, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Commodity State Wise Report
router.get('/total-arrival', requireAuth, requireFYDB, async (req, res) => {
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ error: range.error });

  try {
    const [rows] = await req.fyDbRead.execute(`
      SELECT
        c.name                                                     AS commodity_name,
        c.short_name,
        COALESCE(NULLIF(gp.state_name, ''), 'Unknown')            AS state_name,
        gpi.unit,
        ROUND(SUM(gpi.number_of_bags * gpi.weight_per_bag), 2)   AS total_weight
      FROM gate_pass_items gpi
      JOIN gate_passes gp ON gp.id  = gpi.gate_pass_id
      JOIN commodities c  ON c.id   = gpi.commodity_id
      WHERE DATE(gp.created_at) BETWEEN ? AND ?
      GROUP BY c.id, gp.state_name, gpi.unit
      ORDER BY c.name, state_name
    `, [range.from, range.to]);

    const commodityMap = new Map();
    for (const row of rows) {
      const key = row.commodity_name;
      if (!commodityMap.has(key)) {
        commodityMap.set(key, { commodity_name: key, short_name: row.short_name, states: [] });
      }
      commodityMap.get(key).states.push({ state_name: row.state_name, unit: row.unit, total_weight: row.total_weight });
    }

    const commodities = [...commodityMap.values()].map(c => ({
      ...c,
      grand_total: Math.round(c.states.reduce((s, r) => s + (r.total_weight || 0), 0) * 100) / 100,
    }));
    res.json({ commodities });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Cash Report — vehicle type wise charges
router.get('/cash', requireAuth, requireFYDB, async (req, res) => {
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ error: range.error });

  try {
    const [types] = await req.fyDbRead.execute(`
      SELECT
        vt.id,
        vt.name                    AS vehicle_type,
        vt.charges                 AS rate,
        COUNT(gp.id)               AS count,
        COUNT(gp.id) * vt.charges  AS total_charges
      FROM gate_passes gp
      JOIN vehicle_types vt ON vt.id = gp.vehicle_type_id
      WHERE DATE(gp.created_at) BETWEEN ? AND ?
      GROUP BY vt.id
      ORDER BY total_charges DESC
    `, [range.from, range.to]);

    const summary = {
      total_vehicles: types.reduce((s, t) => s + t.count, 0),
      total_charges:  types.reduce((s, t) => s + t.total_charges, 0),
      type_count:     types.length,
    };
    res.json({ types, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Shop Wise Report
router.get('/shop-wise', requireAuth, requireFYDB, async (req, res) => {
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ error: range.error });

  try {
    const [rows] = await req.fyDbRead.execute(`
      SELECT
        t.shop_number,
        t.trader_name,
        c.id                                                       AS commodity_id,
        c.name                                                     AS commodity_name,
        c.short_name,
        gpi.unit,
        SUM(gpi.number_of_bags)                                    AS total_bags,
        ROUND(SUM(gpi.number_of_bags * gpi.weight_per_bag), 2)    AS total_weight,
        cr.rate
      FROM gate_pass_items gpi
      JOIN gate_passes gp  ON gp.id  = gpi.gate_pass_id
      JOIN traders t       ON t.id   = gpi.trader_id
      JOIN commodities c   ON c.id   = gpi.commodity_id
      LEFT JOIN commodity_rates cr
             ON cr.commodity_id = gpi.commodity_id
            AND cr.date = DATE(gp.created_at)
      WHERE DATE(gp.created_at) BETWEEN ? AND ?
      GROUP BY t.shop_number, c.id, gpi.unit
      ORDER BY
        SUBSTRING(t.shop_number, 1, LOCATE('-', t.shop_number) - 1),
        CAST(SUBSTRING(t.shop_number, LOCATE('-', t.shop_number) + 1) AS UNSIGNED),
        c.name
    `, [range.from, range.to]);

    const shopMap = new Map();
    for (const row of rows) {
      if (!shopMap.has(row.shop_number)) {
        shopMap.set(row.shop_number, { shop_number: row.shop_number, trader_name: row.trader_name, items: [] });
      }
      const totalValue = row.rate != null ? Math.round(row.total_weight * row.rate * 100) / 100 : null;
      shopMap.get(row.shop_number).items.push({
        commodity_name: row.commodity_name,
        short_name:     row.short_name,
        unit:           row.unit,
        total_bags:     row.total_bags,
        total_weight:   row.total_weight,
        rate:           row.rate,
        total_value:    totalValue,
      });
    }

    const shops = [...shopMap.values()].map(s => ({
      ...s,
      grand_weight: Math.round(s.items.reduce((a, i) => a + (i.total_weight || 0), 0) * 100) / 100,
      grand_value:  s.items.every(i => i.total_value != null)
        ? Math.round(s.items.reduce((a, i) => a + (i.total_value || 0), 0) * 100) / 100
        : null,
    }));
    res.json({ shops });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Ledger Report — admin only
router.get('/ledger', requireAdmin, requireFYDB, async (req, res) => {
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ error: range.error });

  const traderFilter = req.query.trader_id ? parseInt(req.query.trader_id) : null;
  const traderWhere  = traderFilter ? 'AND t.id = ?' : '';
  const params       = traderFilter ? [range.from, range.to, traderFilter] : [range.from, range.to];

  try {
    const [rows] = await req.fyDbRead.execute(`
      SELECT
        t.id                                                      AS trader_id,
        t.trader_name,
        t.shop_number,
        DATE(gp.created_at)                                       AS date,
        gp.gate_pass_number,
        gp.vehicle_number,
        c.name                                                    AS commodity_name,
        gpi.unit,
        gpi.number_of_bags,
        gpi.weight_per_bag,
        ROUND(gpi.number_of_bags * gpi.weight_per_bag, 2)        AS total_weight,
        cr.rate
      FROM gate_pass_items gpi
      JOIN gate_passes gp  ON gp.id  = gpi.gate_pass_id
      JOIN traders t       ON t.id   = gpi.trader_id
      JOIN commodities c   ON c.id   = gpi.commodity_id
      LEFT JOIN commodity_rates cr
             ON cr.commodity_id = gpi.commodity_id
            AND cr.date = DATE(gp.created_at)
      WHERE DATE(gp.created_at) BETWEEN ? AND ?
      ${traderWhere}
      ORDER BY
        CAST(SUBSTRING(t.shop_number, IFNULL(NULLIF(LOCATE('-', t.shop_number), 0), 0) + 1) AS UNSIGNED),
        t.shop_number,
        date,
        gp.gate_pass_number,
        c.name
    `, params);

    const [traders] = await req.fyDbRead.execute(`
      SELECT DISTINCT t.id, t.trader_name, t.shop_number
      FROM traders t
      JOIN gate_pass_items gpi ON gpi.trader_id = t.id
      JOIN gate_passes gp      ON gp.id = gpi.gate_pass_id
      WHERE DATE(gp.created_at) BETWEEN ? AND ?
      ORDER BY
        CAST(SUBSTRING(t.shop_number, IFNULL(NULLIF(LOCATE('-', t.shop_number), 0), 0) + 1) AS UNSIGNED),
        t.shop_number
    `, [range.from, range.to]);

    // Group: trader → date → items
    const traderMap = new Map();
    for (const row of rows) {
      const tk = row.trader_id;
      if (!traderMap.has(tk)) {
        traderMap.set(tk, {
          trader_id:    row.trader_id,
          trader_name:  row.trader_name,
          shop_number:  row.shop_number,
          dates:        new Map(),
          grand_weight: 0,
          grand_value:  0,
          grand_fee:    0,
        });
      }
      const trader = traderMap.get(tk);
      if (!trader.dates.has(row.date)) {
        trader.dates.set(row.date, { date: row.date, items: [], sub_weight: 0, sub_value: 0, sub_fee: 0 });
      }
      const dayEntry = trader.dates.get(row.date);
      const tw    = Math.round((row.total_weight || 0) * 100) / 100;
      const value = row.rate != null ? Math.round(tw * row.rate * 100) / 100 : null;
      const fee   = value  != null ? Math.round(value * 0.01 * 100) / 100    : null;

      dayEntry.items.push({
        gate_pass_number: row.gate_pass_number,
        vehicle_number:   row.vehicle_number || '—',
        commodity_name:   row.commodity_name,
        unit:             row.unit,
        number_of_bags:   row.number_of_bags,
        weight_per_bag:   row.weight_per_bag,
        total_weight:     tw,
        rate:             row.rate,
        value,
        fee,
      });

      dayEntry.sub_weight = Math.round((dayEntry.sub_weight + tw)                 * 100) / 100;
      if (value != null) dayEntry.sub_value = Math.round((dayEntry.sub_value + value) * 100) / 100;
      if (fee   != null) dayEntry.sub_fee   = Math.round((dayEntry.sub_fee   + fee)   * 100) / 100;

      trader.grand_weight = Math.round((trader.grand_weight + tw)                  * 100) / 100;
      if (value != null) trader.grand_value = Math.round((trader.grand_value + value) * 100) / 100;
      if (fee   != null) trader.grand_fee   = Math.round((trader.grand_fee   + fee)   * 100) / 100;
    }

    const ledger = [...traderMap.values()].map(t => ({ ...t, dates: [...t.dates.values()] }));
    res.json({ ledger, traders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate ledger' });
  }
});

module.exports = router;
