/* ============================================================
   MANDI — Navigation (sidebar, page switching)
   ============================================================ */

const pageTitles = {
  'dashboard': 'Dashboard',
  'commodity-master': 'Commodity Master',
  'trader-master': 'Shop / Trader Master',
  'vehicle-type-master': 'Vehicle Type Master',
  'state-master': 'State Codes',
  'gate-pass': 'Gate Pass Entry',
  'user-management': 'User Management',
  'report-gatepass': 'Gate Pass Wise Report',
  'report-commodity': 'Commodity Wise Report',
  'report-arrival': 'Commodity State Wise Report',
  'report-cash': 'Cash Report',
  'rate-entry':      'Daily Rate Entry',
  'report-shopwise': 'Shop Wise Report',
  'report-ledger':   'Ledger Report',
};

function navigateTo(page) {
  if (page === 'user-management' && (!state.user || state.user.level !== 'admin')) {
    showToast('Access denied', 'error');
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const target = document.getElementById(`page-${page}`);
  if (!target) return;
  target.classList.add('active');
  state.currentPage = page;

  document.getElementById('page-title').textContent = pageTitles[page] || page;

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  document.querySelectorAll('.nav-group').forEach(group => {
    const items = group.querySelector('.nav-group-items');
    const header = group.querySelector('.nav-group-header');
    const hasActive = group.querySelector('.nav-item.active');
    if (hasActive) {
      items.classList.add('open');
      header.classList.add('open', 'active');
    }
  });

  if (page === 'commodity-master') loadCommodities();
  if (page === 'trader-master') loadTraders();
  if (page === 'vehicle-type-master') loadVehicleTypes();
  if (page === 'state-master') loadStates();
  if (page === 'gate-pass') loadGatePassPage();
  if (page === 'user-management') loadUserManagement();
}

function initNavigationModule() {
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  document.querySelectorAll('.stat-card[data-page]').forEach(card => {
    card.addEventListener('click', () => navigateTo(card.dataset.page));
  });

  document.querySelectorAll('.nav-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const menu = header.dataset.menu;
      const items = document.getElementById(`menu-${menu}`);
      const isOpen = items.classList.contains('open');
      items.classList.toggle('open', !isOpen);
      header.classList.toggle('open', !isOpen);
    });
  });

  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });
}
