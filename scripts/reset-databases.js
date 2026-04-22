/**
 * reset-databases.js
 * Drops ALL databases that start with "mandi_" EXCEPT "mandi_main".
 * Also clears financial_years and resets active_fy on all mandis.
 *
 * Run ONCE:  node scripts/reset-databases.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE = {
  host:     process.env.MYSQL_HOST     || 'localhost',
  port:     parseInt(process.env.MYSQL_PORT) || 3306,
  user:     process.env.MYSQL_USER     || 'root',
  password: process.env.MYSQL_PASSWORD || '',
};
const MAIN_DB = process.env.MYSQL_MAIN_DB || 'mandi_main';

(async () => {
  const conn = await mysql.createConnection(BASE);

  // Find all mandi_* databases except mandi_main
  const [dbs] = await conn.query("SHOW DATABASES LIKE 'mandi\\_%'");
  const toDrop = dbs
    .map(r => Object.values(r)[0])
    .filter(name => name !== MAIN_DB);

  if (toDrop.length === 0) {
    console.log('No FY databases found to drop.');
  } else {
    for (const db of toDrop) {
      await conn.query(`DROP DATABASE IF EXISTS \`${db}\``);
      console.log(`Dropped: ${db}`);
    }
  }

  // Clear financial_years and reset active_fy in main DB
  await conn.query(`USE \`${MAIN_DB}\``);
  await conn.query('DELETE FROM financial_years');
  await conn.query('UPDATE mandis SET active_fy = NULL');
  console.log('Cleared financial_years table and reset active_fy for all mandis.');

  await conn.end();
  console.log('\nDone. All FY databases removed. Run the app and create new financial years.');
})().catch(err => { console.error(err); process.exit(1); });
