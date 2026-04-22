const http = require('http');
const reqOpts = { hostname: 'localhost', port: 3000, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } };
const req = http.request(reqOpts, (res) => {
  const cookie = res.headers['set-cookie'][0].split(';')[0];
  const switchReq = http.request({ hostname: 'localhost', port: 3000, path: '/api/auth/switch-mandi', method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie } }, (res2) => {
    
    // Now call ledger
    const ledgerReq = http.request({
      hostname: 'localhost', port: 3000, path: '/api/reports/ledger?from=2026-04-01&to=2026-04-30', method: 'GET',
      headers: { 'Cookie': cookie }
    }, (res3) => {
      let data = ''; res3.on('data', d => data += d); res3.on('end', () => console.log('Ledger:', res3.statusCode, data.substring(0, 100)));
    });
    ledgerReq.end();
  });
  switchReq.write(JSON.stringify({ mandi_id: 7 })); switchReq.end();
});
req.write(JSON.stringify({ username: 'superadmin', password: 'superadmin123' })); req.end();
