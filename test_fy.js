const http = require('http');
const reqOpts = { hostname: 'localhost', port: 3000, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } };
const req = http.request(reqOpts, (res) => {
  const cookie = res.headers['set-cookie'][0].split(';')[0];
  const switchReq = http.request({ hostname: 'localhost', port: 3000, path: '/api/auth/switch-mandi', method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie } }, (res2) => {
    const fyReq = http.request({ hostname: 'localhost', port: 3000, path: '/api/fy/list', method: 'GET', headers: { 'Cookie': cookie } }, (res3) => {
      let data = ''; res3.on('data', d => data += d); res3.on('end', () => console.log('FY response:', data));
    });
    fyReq.end();
  });
  switchReq.write(JSON.stringify({ mandi_id: 1 })); switchReq.end();
});
req.write(JSON.stringify({ username: 'superadmin', password: 'superadmin123' })); req.end();
