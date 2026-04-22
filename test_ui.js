const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
  
  await page.goto('http://localhost:3000');
  
  // Login
  await page.type('#login-username', 'superadmin');
  await page.type('#login-password', 'superadmin123');
  await page.click('#login-btn');
  await page.waitForNavigation();
  
  // Select mandi (Flower Mkt)
  await page.select('#context-mandi-select', '7');
  await new Promise(r => setTimeout(r, 1000));
  
  // Go to ledger report
  await page.click('.nav-item[data-page="report-ledger"]');
  await new Promise(r => setTimeout(r, 500));
  
  // Click Generate
  await page.click('#rpt-ld-fetch');
  await new Promise(r => setTimeout(r, 1000));
  
  console.log("Result HTML:", await page.evaluate(() => document.getElementById('rpt-ld-result').innerHTML.substring(0, 500)));
  
  await browser.close();
})();
