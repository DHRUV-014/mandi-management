const express = require('express');
const session = require('express-session');
const http    = require('http');
const path    = require('path');
require('dotenv').config();

const { initMainDB, getMainPool, getMandiFYPool, getMandiById, getPool, fyBelongsToMandi, MAIN_DB } = require('./database');
const { attachWS } = require('./ws');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function startServer() {
  await initMainDB();

  const MySQLStore = require('express-mysql-session')(session);
  const sessionStore = new MySQLStore({
    host:                    process.env.MYSQL_HOST     || 'localhost',
    port:                    parseInt(process.env.MYSQL_PORT) || 3306,
    user:                    process.env.MYSQL_USER     || 'root',
    password:                process.env.MYSQL_PASSWORD || '',
    database:                MAIN_DB,
    clearExpired:            true,
    checkExpirationInterval: 900000,
    expiration:              28800000,
    createDatabaseTable:     true,
  });

  const sessionMiddleware = session({
    store:             sessionStore,
    secret:            process.env.SESSION_SECRET || 'mandi-secret-key-2024',
    resave:            false,
    saveUninitialized: false,
    cookie: {
      secure:   process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge:   8 * 60 * 60 * 1000,
    },
  });

  app.use(sessionMiddleware);

  // Attach DB pools and mandi context to every request.
  //
  //   req.fyDb        → pool for the ACTIVE FY (always used for writes / current work).
  //   req.fyDbRead    → pool for the FY the user is currently VIEWING (historical
  //                     browse by admins / users with view_past_fy permission).
  //                     Defaults to req.fyDb.
  //   req.fyDbReadCode → FY code backing req.fyDbRead (for display).
  app.use(async (req, res, next) => {
    req.mainDb        = getMainPool();
    req.fyDb          = null;
    req.fyDbRead      = null;
    req.fyDbReadCode  = null;
    req.mandi         = null;

    const user = req.session.user;
    if (user) {
      const mandiId = req.session.current_mandi_id != null
        ? req.session.current_mandi_id
        : (user.mandi_id || null);
      if (mandiId) {
        try {
          req.mandi = await getMandiById(mandiId);
          req.fyDb  = await getMandiFYPool(mandiId);

          // Resolve viewing FY from session (historical read override)
          const selected = req.session.selected_fy_code;
          if (selected && selected !== (req.mandi && req.mandi.active_fy)) {
            const canViewPast = user.level === 'superadmin'
              || user.level === 'admin'
              || (Array.isArray(user.permissions) && user.permissions.includes('view_past_fy'));
            if (canViewPast && await fyBelongsToMandi(mandiId, selected)) {
              req.fyDbRead     = getPool(selected);
              req.fyDbReadCode = selected;
            }
          }
          if (!req.fyDbRead) {
            req.fyDbRead     = req.fyDb;
            req.fyDbReadCode = req.mandi && req.mandi.active_fy;
          }
        } catch { /* fyDb stays null */ }
      }
    }
    next();
  });

  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api/auth',          require('./routes/auth'));
  app.use('/api/dashboard',     require('./routes/dashboard'));
  app.use('/api/users',         require('./routes/users'));
  app.use('/api/mandis',        require('./routes/mandis'));
  app.use('/api/profile',       require('./routes/profile'));
  app.use('/api/commodities',   require('./routes/commodity'));
  app.use('/api/traders',       require('./routes/trader'));
  app.use('/api/gate-pass',     require('./routes/gatepass'));
  app.use('/api/vehicle-types', require('./routes/vehicleType'));
  app.use('/api/reports',       require('./routes/reports'));
  app.use('/api/states',        require('./routes/stateCode'));
  app.use('/api/rates',         require('./routes/rates'));
  app.use('/api/admin-db',      require('./routes/adminDb'));
  app.use('/api/fy',            require('./routes/fy'));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  const server = http.createServer(app);
  attachWS(server, sessionMiddleware);

  server.listen(PORT, () => {
    console.log(`\nMandi Management System running at http://localhost:${PORT}`);
    console.log('System superadmin: superadmin / superadmin123\n');
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
