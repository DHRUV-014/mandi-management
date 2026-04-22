const mysql = require('mysql2/promise');
const { MAIN_DB, getPool } = require('./database.js');

async function test() {
  try {
    const mainPool = getPool(MAIN_DB);
    const [users] = await mainPool.execute('SELECT username, level FROM users');
    console.log(users);
  } catch (err) {
    console.error("Error:", err.message);
  }
  process.exit(0);
}
test();
