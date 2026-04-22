const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/reports/ledger?from=2026-04-01&to=2026-04-30',
  method: 'GET',
  headers: {
    // Need a valid session cookie for admin
  }
};
// actually it's easier to use the database to simulate the request or check server logs
