/* ============================================================
   MANDI — Entry point
   Loads every page fragment, injects them into #page-content,
   wires up each module, then kicks off the session check.
   ============================================================ */

const PAGE_LIST = [
  'dashboard',
  'commodity-master',
  'trader-master',
  'vehicle-type-master',
  'state-master',
  'gate-pass',
  'report-gatepass',
  'report-commodity',
  'report-arrival',
  'report-cash',
  'rate-entry',
  'report-shopwise',
  'report-ledger',
  'user-management',
  'mandi-profile',
  'mandi-management',
  'admin-sql',
];

(async function bootstrap() {
  try {
    const fragments = await Promise.all(
      PAGE_LIST.map(p => fetch(`pages/${p}.html`).then(r => {
        if (!r.ok) throw new Error(`Failed to load pages/${p}.html`);
        return r.text();
      }))
    );

    const container = document.getElementById('page-content');
    PAGE_LIST.forEach((page, i) => {
      const wrapper = document.createElement('div');
      wrapper.id = `page-${page}`;
      wrapper.className = page === 'dashboard' ? 'page active' : 'page';
      wrapper.innerHTML = fragments[i];
      container.appendChild(wrapper);
    });

    // Wire up all tabs and global UI
    initAuthModule();
    initNavigationModule();
    initCommodityModule();
    initTraderModule();
    initVehicleTypeModule();
    initStateCodeModule();
    initGatePassModule();
    initUserManagementModule();
    initReportsModule();
    initRatesModule();
    initProfileModule();
    initMandiManagementModule();
    initDeviceSetupModule();

    // Load profile then check session
    await loadMandiProfile();
    checkSession();
  } catch (err) {
    console.error('Bootstrap failed:', err);
    document.body.insertAdjacentHTML('afterbegin',
      `<div style="padding:20px;background:#fee;color:#900;font-family:sans-serif">Failed to load application: ${err.message}</div>`);
  }
})();
