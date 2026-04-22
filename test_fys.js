const mysql = require('mysql2/promise');
const { MAIN_DB, getPool } = require('./database.js');
async function test() {
  const mainPool = getPool(MAIN_DB);
  const [fys] = await mainPool.execute('SELECT * FROM financial_years');
  console.log(fys);
  process.exit(0);
}
test();
