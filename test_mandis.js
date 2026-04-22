const mysql = require('mysql2/promise');
const { MAIN_DB, getPool } = require('./database.js');
async function test() {
  const mainPool = getPool(MAIN_DB);
  const [mandis] = await mainPool.execute('SELECT * FROM mandis');
  console.log(mandis);
  process.exit(0);
}
test();
