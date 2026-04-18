const express = require('express');
const session = require('express-session');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Initialize DB (creates tables + seeds)
require('./database');

const authRoutes = require('./routes/auth');
const commodityRoutes = require('./routes/commodity');
const traderRoutes = require('./routes/trader');
const gatePassRoutes = require('./routes/gatepass');
const userRoutes = require('./routes/users');
const vehicleTypeRoutes = require('./routes/vehicleType');
const reportRoutes = require('./routes/reports');
const stateCodeRoutes = require('./routes/stateCode');
const ratesRoutes = require('./routes/rates');

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
const SqliteStore = require('connect-sqlite3')(session);
app.use(session({
  store: new SqliteStore({ db: 'sessions.db', dir: __dirname }),
  secret: process.env.SESSION_SECRET || 'mandi-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/commodities', commodityRoutes);
app.use('/api/traders', traderRoutes);
app.use('/api/gate-pass', gatePassRoutes);
app.use('/api/vehicle-types', vehicleTypeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/states', stateCodeRoutes);
app.use('/api/rates', ratesRoutes);

// Serve SPA for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\nMandi Management System running at http://localhost:${PORT}`);
  console.log('Default credentials:');
  console.log('  admin     / admin123    (level: admin)');
  console.log('  operator  / operator123 (level: operator)\n');
});
