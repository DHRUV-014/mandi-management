const mysql = require('mysql2/promise');
const { MAIN_DB, getPool } = require('./database.js');

async function test() {
  try {
    const pool = getPool('mandi_fm_fy_2526'); // Wait, I don't know the DB name. Let's get the active FY DB.
    const mainPool = getPool(MAIN_DB);
    const [mandis] = await mainPool.execute('SELECT active_fy FROM mandis LIMIT 1');
    if (mandis.length === 0 || !mandis[0].active_fy) {
        console.log("No active FY");
        process.exit(1);
    }
    const fyDbName = mandis[0].active_fy;
    const fyPool = getPool(fyDbName);
    
    console.log("Testing shop wise order by...");
    const [rows] = await fyPool.execute(`
      SELECT shop_number FROM traders
      ORDER BY
        SUBSTRING(shop_number, 1, LOCATE('-', shop_number) - 1),
        CAST(SUBSTRING(shop_number, LOCATE('-', shop_number) + 1) AS UNSIGNED)
    `);
    console.log("Success:", rows);
  } catch (err) {
    console.error("Error:", err.message);
  }
  process.exit(0);
}
test();
