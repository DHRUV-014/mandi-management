/* ============================================================
   MANDI — Navigation (sidebar, page switching, context bar)
   ============================================================ */

const pageTitles = {
  'dashboard':          'Dashboard',
  'commodity-master':   'Commodity Master',
  'trader-master':      'Shop / Trader Master',
  'vehicle-type-master':'Vehicle Type Master',
  'state-master':       'State Codes',
  'gate-pass':          'Gate Pass Entry',
  'user-management':    'User Management',
  'report-gatepass':    'Gate Pass Wise Report',
  'report-commodity':   'Commodity Wise Report',
  'report-arrival':     'Commodity State Wise Report',
  'report-cash':        'Cash Report',
  'rate-entry':         'Daily Rate Entry',
  'report-shopwise':    'Shop Wise Report',
  'report-ledger':      'Ledger Report',
  'mandi-profile':      'Mandi Profile',
  'mandi-management':   'Mandi Management',
  'admin-sql':          'Database Viewer',
};

let adminSqlInitialised = false;

function navigateTo(page) {
  const level = state.user?.level;

  // Permission checks
  if (page === 'user-management' && !['admin', 'superadmin'].includes(level)) return;
  if (page === 'mandi-management' && level !== 'superadmin') return;
  if (page === 'admin-sql' && level !== 'superadmin') return;

  // Feature permission checks
  const permMap = {
    'gate-pass': 'gate_pass',
    'rate-entry': 'rate_entry',
    'report-gatepass': 'reports', 'report-commodity': 'reports',
    'report-arrival': 'reports', 'report-cash': 'reports',
    'report-shopwise': 'reports', 'report-ledger': 'reports',
    'commodity-master': 'commodity_master',
    'trader-master': 'trader_master',
    'vehicle-type-master': 'vehicle_type_master',
    'state-master': 'state_master',
  };
  if (permMap[page] && !hasPermission(permMap[page])) return;

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
    const items  = group.querySelector('.nav-group-items');
    const header = group.querySelector('.nav-group-header');
    const hasActive = group.querySelector('.nav-item.active');
    if (hasActive) { items.classList.add('open'); header.classList.add('open', 'active'); }
  });

  if (page === 'dashboard')           loadDashboard();
  if (page === 'mandi-profile')       loadMandiProfile();
  if (page === 'mandi-management')    loadMandiManagement();
  if (page === 'commodity-master')    loadCommodities();
  if (page === 'trader-master')       loadTraders();
  if (page === 'vehicle-type-master') loadVehicleTypes();
  if (page === 'state-master')        loadStates();
  if (page === 'gate-pass')           loadGatePassPage();
  if (page === 'user-management')     loadUserManagement();
  if (page === 'rate-entry')          loadRatesPage();
  if (page.startsWith('report-'))     loadReportPage(page);
  if (page === 'admin-sql') {
    if (!adminSqlInitialised) { adminSqlInitialised = true; initAdminSqlModule(); }
    else { adbLoadFYList(); }
  }
}

/* ── Context Bar ──────────────────────────────── */

async function initContextBar() {
  const bar = document.getElementById('context-bar');
  if (!bar || !state.user) return;

  const isSuperAdmin   = state.user.level === 'superadmin';
  const isAdmin        = state.user.level === 'admin';
  const assignedMandis = state.user.assignedMandis || [];
  const isMultiMandi   = !isSuperAdmin && assignedMandis.length > 1;
  const canViewPast    = isSuperAdmin || isAdmin
    || (Array.isArray(state.user.permissions) && state.user.permissions.includes('view_past_fy'));

  // Ensure session context is synced (old sessions may not have current_mandi_id)
  if (!isSuperAdmin && state.user.mandi_id && !state.user.current_mandi_id) {
    const { ok } = await api('POST', '/api/auth/switch-mandi', { mandi_id: state.user.mandi_id });
    if (ok) state.user.current_mandi_id = state.user.mandi_id;
  }

  // Hide bar entirely only if: single-mandi AND cannot view past FYs.
  if (!isSuperAdmin && !isMultiMandi && !canViewPast) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  const select    = document.getElementById('context-mandi-select');
  const mandiWrap = document.getElementById('context-mandi-select');

  if (isSuperAdmin) {
    const { ok, data } = await api('GET', '/api/mandis');
    if (ok) {
      select.innerHTML = '<option value="">— Select a mandi —</option>' +
        data.map(m => `<option value="${m.id}">${escapeHtml(m.name)} [${escapeHtml(m.prefix)}]</option>`).join('');
    }
  } else {
    select.innerHTML = '<option value="">— Select a mandi —</option>' +
      assignedMandis.map(m =>
        `<option value="${m.id}">${escapeHtml(m.name)} [${escapeHtml(m.prefix)}]</option>`
      ).join('');
  }

  // For single-mandi users we don't need the picker (they can't switch) — hide it but keep the bar.
  if (!isSuperAdmin && !isMultiMandi && mandiWrap) {
    mandiWrap.style.display = 'none';
    const lbl = bar.querySelector('.context-bar-label');
    if (lbl) lbl.style.display = 'none';
  }

  if (state.user.current_mandi_id) select.value = state.user.current_mandi_id;
  await updateContextFYBadge();
  await refreshFYSelector();
}

async function updateContextFYBadge() {
  const badge = document.getElementById('context-fy-badge');
  if (!badge) return;
  const mandiId = state.user?.current_mandi_id;
  if (!mandiId) { badge.textContent = ''; badge.classList.add('hidden'); return; }

  const { ok, data } = await api('GET', `/api/fy/list`);
  if (ok) {
    const effectiveCode = data.selected_fy || data.active_fy;
    const fy = data.financial_years.find(f => f.code === effectiveCode);
    if (fy?.fy_label) {
      const viewingPast = data.selected_fy && data.selected_fy !== data.active_fy;
      badge.textContent = viewingPast ? `📂 Viewing FY ${fy.fy_label}` : `FY ${fy.fy_label}`;
      badge.classList.remove('hidden');
      if (viewingPast) {
        badge.style.background   = '#fef3c7';
        badge.style.color        = '#92400e';
        badge.style.borderColor  = '#fde68a';
      } else {
        badge.style.background   = '';
        badge.style.color        = '';
        badge.style.borderColor  = '';
      }
      return;
    }
  }
  badge.textContent = 'No active FY';
  badge.classList.remove('hidden');
  badge.style.background = '#fef2f2';
  badge.style.color = '#991b1b';
  badge.style.borderColor = '#fecaca';
}

/* ── FY Selector (historical viewing) ─────────── */

async function refreshFYSelector() {
  const wrap = document.getElementById('context-fy-selector-wrap');
  const select = document.getElementById('context-fy-selector');
  if (!wrap || !select) return;

  const mandiId = state.user?.current_mandi_id;
  if (!mandiId) { wrap.classList.add('hidden'); return; }

  const { ok, data } = await api('GET', '/api/fy/list');
  if (!ok || !data.can_view_past || !data.financial_years?.length) {
    wrap.classList.add('hidden');
    return;
  }

  wrap.classList.remove('hidden');
  const activeCode = data.active_fy;
  select.innerHTML = data.financial_years.map(f => {
    const tag = f.code === activeCode ? ' (Active)' : '';
    return `<option value="${escapeHtml(f.code)}">${escapeHtml(f.fy_label || f.code)}${tag}</option>`;
  }).join('');

  const effective = data.selected_fy || data.active_fy || '';
  if (effective) select.value = effective;

  // Visual cue when viewing historical
  const viewingHistorical = data.selected_fy && data.selected_fy !== data.active_fy;
  wrap.classList.toggle('viewing-historical', !!viewingHistorical);
}

function initNavigationModule() {
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', (e) => { e.preventDefault(); navigateTo(item.dataset.page); });
  });
  document.querySelectorAll('.stat-card[data-page]').forEach(card => {
    card.addEventListener('click', () => navigateTo(card.dataset.page));
  });
  document.querySelectorAll('.nav-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const menu  = header.dataset.menu;
      const items = document.getElementById(`menu-${menu}`);
      const isOpen = items.classList.contains('open');
      items.classList.toggle('open', !isOpen);
      header.classList.toggle('open', !isOpen);
    });
  });

  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });
  document.getElementById('home-btn').addEventListener('click', () => navigateTo('dashboard'));

  // Context bar mandi switch
  const contextSelect = document.getElementById('context-mandi-select');
  if (contextSelect) {
    contextSelect.addEventListener('change', async (e) => {
      const mandiId = e.target.value;
      const { ok } = await api('POST', '/api/auth/switch-mandi', { mandi_id: mandiId || null });
      if (ok) {
        const newId = mandiId ? parseInt(mandiId) : null;
        state.user.current_mandi_id = newId;
        notifyLiveMandiChange(newId);
        await reloadCurrentContext();
      } else {
        showToast('Failed to switch mandi', 'error');
        e.target.value = state.user.current_mandi_id || '';
      }
    });
  }

  // FY selector (for admins / users with view_past_fy)
  const fySel = document.getElementById('context-fy-selector');
  if (fySel) {
    fySel.addEventListener('change', async (e) => {
      const code = e.target.value || null;
      const { ok, data } = await api('POST', '/api/fy/select', { code });
      if (!ok) {
        showToast(data.error || 'Failed to switch financial year', 'error');
        await refreshFYSelector();
        return;
      }
      showToast(data.active
        ? 'Viewing live data (active financial year)'
        : `Viewing historical data: ${code}`,
        'info');
      await reloadCurrentContext();
    });
  }
}
