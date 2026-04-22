const mysql = require('mysql2/promise');
const { MAIN_DB, getPool } = require('./database.js');

async function test() {
  try {
    const mainPool = getPool(MAIN_DB);
    const [mandis] = await mainPool.execute('SELECT active_fy FROM mandis LIMIT 1');
    const fyPool = getPool(mandis[0].active_fy);
    
    console.log("Testing ledger order by...");
    const [traders] = await fyPool.execute(`
      SELECT DISTINCT t.id, t.trader_name, t.shop_number
      FROM traders t
      JOIN gate_pass_items gpi ON gpi.trader_id = t.id
      JOIN gate_passes gp      ON gp.id = gpi.gate_pass_id
      WHERE DATE(gp.created_at) BETWEEN '2020-01-01' AND '2030-01-01'
      ORDER BY
        CAST(SUBSTRING(t.shop_number, IFNULL(NULLIF(LOCATE('-', t.shop_number), 0), 0) + 1) AS UNSIGNED),
        t.shop_number
    `);
    console.log("Success:", traders);
  } catch (err) {
    console.error("Error:", err.message);
  }
  process.exit(0);
}
test();
