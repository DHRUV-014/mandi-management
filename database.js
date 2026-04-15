const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const db = new Database(path.join(__dirname, 'app.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'operator'
  );

  CREATE TABLE IF NOT EXISTS commodities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    unit TEXT NOT NULL,
    short_name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS traders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trader_name TEXT NOT NULL,
    shop_number TEXT UNIQUE NOT NULL,
    license_number TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gate_passes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gate_pass_number INTEGER UNIQUE NOT NULL,
    trader_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (date('now')),
    FOREIGN KEY (trader_id) REFERENCES traders(id)
  );

  CREATE TABLE IF NOT EXISTS gate_pass_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gate_pass_id INTEGER NOT NULL,
    commodity_id INTEGER NOT NULL,
    unit TEXT NOT NULL,
    number_of_bags INTEGER NOT NULL,
    FOREIGN KEY (gate_pass_id) REFERENCES gate_passes(id),
    FOREIGN KEY (commodity_id) REFERENCES commodities(id)
  );
`);

// Migrate: add created_at to users if not present
const userCols = db.prepare("PRAGMA table_info(users)").all();
if (!userCols.find(c => c.name === 'created_at')) {
  db.exec("ALTER TABLE users ADD COLUMN created_at TEXT");
  db.exec("UPDATE users SET created_at = datetime('now') WHERE created_at IS NULL");
}

// Migrate: normalise legacy 'operator' level → 'user'
try {
  db.exec("UPDATE users SET level = 'user' WHERE level NOT IN ('admin', 'user')");
} catch (_) {}

// Seed default users if none exist
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCount.count === 0) {
  const adminHash = bcrypt.hashSync('admin123', 10);
  const userHash  = bcrypt.hashSync('user123', 10);

  db.prepare('INSERT INTO users (username, password_hash, level) VALUES (?, ?, ?)').run('admin', adminHash, 'admin');
  db.prepare('INSERT INTO users (username, password_hash, level) VALUES (?, ?, ?)').run('operator', userHash, 'user');

  console.log('Seeded default users: admin (admin123) and operator (user123)');
}

// Migrate: add weight_per_bag to gate_pass_items if not present
try {
  db.exec('ALTER TABLE gate_pass_items ADD COLUMN weight_per_bag REAL NOT NULL DEFAULT 0');
} catch (_) { /* column already exists */ }

// Migrate: add per-row trader_id to gate_pass_items
try {
  db.exec('ALTER TABLE gate_pass_items ADD COLUMN trader_id INTEGER');
  // Copy trader_id down from parent gate_pass for existing rows
  db.exec(`
    UPDATE gate_pass_items
    SET trader_id = (
      SELECT gp.trader_id FROM gate_passes gp WHERE gp.id = gate_pass_items.gate_pass_id
    )
    WHERE trader_id IS NULL
  `);
} catch (_) { /* column already exists */ }

// Migrate: add phone_number to traders if not present
const traderCols = db.prepare("PRAGMA table_info(traders)").all();
if (!traderCols.find(c => c.name === 'phone_number')) {
  db.exec("ALTER TABLE traders ADD COLUMN phone_number TEXT");
}

// Migrate: add status to traders if not present
const traderColsV2 = db.prepare("PRAGMA table_info(traders)").all();
if (!traderColsV2.find(c => c.name === 'status')) {
  db.exec("ALTER TABLE traders ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}

// Create vehicle_types table
db.exec(`
  CREATE TABLE IF NOT EXISTS vehicle_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    charges REAL NOT NULL DEFAULT 0
  );
`);

// Migrate: add vehicle_type_id to gate_passes if not present
const gpCols = db.prepare("PRAGMA table_info(gate_passes)").all();
if (!gpCols.find(c => c.name === 'vehicle_type_id')) {
  db.exec("ALTER TABLE gate_passes ADD COLUMN vehicle_type_id INTEGER");
}

// Migrate: add vehicle_number / state_code / state_name to gate_passes
const gpColsV2 = db.prepare("PRAGMA table_info(gate_passes)").all();
if (!gpColsV2.find(c => c.name === 'vehicle_number')) {
  db.exec("ALTER TABLE gate_passes ADD COLUMN vehicle_number TEXT");
}
if (!gpColsV2.find(c => c.name === 'state_code')) {
  db.exec("ALTER TABLE gate_passes ADD COLUMN state_code TEXT");
}
if (!gpColsV2.find(c => c.name === 'state_name')) {
  db.exec("ALTER TABLE gate_passes ADD COLUMN state_name TEXT");
}

// Migrate: add builty_no to gate_passes
const gpColsV3 = db.prepare("PRAGMA table_info(gate_passes)").all();
if (!gpColsV3.find(c => c.name === 'builty_no')) {
  db.exec("ALTER TABLE gate_passes ADD COLUMN builty_no TEXT");
}

// Create state_codes table
db.exec(`
  CREATE TABLE IF NOT EXISTS state_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state_name TEXT NOT NULL,
    state_code TEXT UNIQUE NOT NULL
  );
`);

// Seed state codes if empty
const stateCount = db.prepare('SELECT COUNT(*) as count FROM state_codes').get();
if (stateCount.count === 0) {
  const seedStates = [
    ['Delhi', 'DL'], ['Haryana', 'HR'], ['Maharashtra', 'MH'], ['Uttar Pradesh', 'UP'],
    ['Rajasthan', 'RJ'], ['Punjab', 'PB'], ['Gujarat', 'GJ'], ['Madhya Pradesh', 'MP'],
    ['West Bengal', 'WB'], ['Tamil Nadu', 'TN'], ['Karnataka', 'KA'], ['Kerala', 'KL'],
    ['Andhra Pradesh', 'AP'], ['Telangana', 'TS'], ['Bihar', 'BR'], ['Odisha', 'OR'],
    ['Assam', 'AS'], ['Jharkhand', 'JH'], ['Uttarakhand', 'UK'], ['Himachal Pradesh', 'HP'],
    ['Jammu & Kashmir', 'JK'], ['Goa', 'GA'], ['Manipur', 'MN'], ['Meghalaya', 'ML'],
    ['Mizoram', 'MZ'], ['Nagaland', 'NL'], ['Sikkim', 'SK'], ['Tripura', 'TR'],
    ['Arunachal Pradesh', 'AR'], ['Chandigarh', 'CH'], ['Dadra & Nagar Haveli', 'DN'],
    ['Daman & Diu', 'DD'], ['Lakshadweep', 'LD'], ['Puducherry', 'PY'],
    ['Andaman & Nicobar', 'AN'], ['Ladakh', 'LA'],
  ];
  const insert = db.prepare('INSERT INTO state_codes (state_name, state_code) VALUES (?, ?)');
  const seed = db.transaction(() => { for (const [n, c] of seedStates) insert.run(n, c); });
  seed();
  console.log(`Seeded ${seedStates.length} state codes`);
}

module.exports = db;

