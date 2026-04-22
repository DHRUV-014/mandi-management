/* Role-based dashboard */

function dbGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

async function loadDashboard() {
  const { ok, data } = await api('GET', '/api/dashboard');
  if (!ok) return;

  ['db-superadmin', 'db-user', 'db-no-mandi'].forEach(id =>
    document.getElementById(id).classList.add('hidden')
  );

  if (data.role === 'superadmin') {
    renderSuperadminDashboard(data);
  } else if (data.mandi) {
    renderUserDashboard(data);
  } else {
    document.getElementById('db-no-mandi').classList.remove('hidden');
  }
}

function renderSuperadminDashboard(data) {
  document.getElementById('db-superadmin').classList.remove('hidden');
  document.getElementById('db-sa-greeting').textContent = dbGreeting() + ', superadmin';
  document.getElementById('db-sa-mandi-count').textContent = data.mandis.length;

  const container = document.getElementById('db-sa-mandis');

  if (!data.mandis.length) {
    container.innerHTML = `
      <div class="db-empty-card">
        <div style="font-size:40px;margin-bottom:10px">🏪</div>
        <strong>No mandis yet</strong>
        <p>Go to <a href="#" onclick="navigateTo('mandi-management')" style="color:var(--primary)">Mandi Management</a> to add your first mandi.</p>
      </div>`;
    return;
  }

  container.innerHTML = data.mandis.map(m => {
    const hasFY    = !!m.active_fy;
    const hasUsers = m.user_count > 0;
    const allDone  = hasFY && hasUsers;

    const fyChip = hasFY
      ? `<span class="db-chip db-chip-ok">✔ FY Active</span>`
      : `<span class="db-chip db-chip-warn" onclick="navigateTo('mandi-management')">⚠ No Financial Year</span>`;

    const userChip = hasUsers
      ? `<span class="db-chip db-chip-ok">✔ ${m.user_count} user${m.user_count !== 1 ? 's' : ''}</span>`
      : `<span class="db-chip db-chip-warn" onclick="navigateTo('user-management')">⚠ No Users Yet</span>`;

    return `
      <div class="db-mandi-card ${allDone ? '' : 'db-mandi-card-warn'}">
        <div class="db-mandi-card-left">
          <div class="db-mandi-name">
            ${escapeHtml(m.name)}
            <span class="db-prefix-badge">${escapeHtml(m.prefix)}</span>
          </div>
          <div class="db-mandi-meta">
            ${m.address_line1 ? escapeHtml(m.address_line1) + (m.address_line2 ? ', ' + escapeHtml(m.address_line2) : '') : ''}
            ${m.phone ? ' · 📞 ' + escapeHtml(m.phone) : ''}
          </div>
          <div class="db-mandi-fy">${m.active_fy ? escapeHtml(m.active_fy) : 'No active database'}</div>
        </div>
        <div class="db-mandi-chips">
          <span class="db-chip db-chip-ok">✔ Created</span>
          ${fyChip}
          ${userChip}
        </div>
        <button class="btn btn-sm btn-ghost" onclick="navigateTo('mandi-management')" style="flex-shrink:0">Manage →</button>
      </div>`;
  }).join('');
}

function renderUserDashboard(data) {
  document.getElementById('db-user').classList.remove('hidden');

  const isAdmin = data.role === 'admin';
  const mandi   = data.mandi;
  const s       = data.stats;
  const gate    = getGateNumber();

  document.getElementById('db-greeting').textContent    = dbGreeting() + ', ' + escapeHtml(state.user?.username || '');
  document.getElementById('db-mandi-title').textContent = mandi.name;
  document.getElementById('db-hero-sub').textContent    =
    `Gate ${gate}  ·  ${isAdmin ? 'Administrator' : 'Operator'}  ·  FY ${mandi.active_fy || 'Not set'}`;

  document.getElementById('db-today-big').textContent   = s.today_gate_passes;
  document.getElementById('db-total-gp').textContent    = s.total_gate_passes;
  document.getElementById('db-traders').textContent     = s.total_traders;
  document.getElementById('db-commodities').textContent = s.total_commodities;

  // No FY banner
  document.getElementById('db-no-fy-warning').classList.toggle('hidden', data.has_fy);

  // Admin extras
  const adminAction = document.getElementById('db-action-users');
  if (adminAction) adminAction.classList.toggle('hidden', !isAdmin);

  if (isAdmin) {
    const missing = [];
    if (s.total_commodities === 0) missing.push({ label: 'Add Commodities',   sub: 'e.g. Wheat, Rice, Onion',      page: 'commodity-master',    icon: '🌾' });
    if (s.total_traders === 0)     missing.push({ label: 'Add Traders / Shops', sub: 'Shop numbers and trader names', page: 'trader-master',       icon: '🏪' });

    const card = document.getElementById('db-checklist-card');
    if (missing.length > 0) {
      card.classList.remove('hidden');
      document.getElementById('db-checklist-body').innerHTML = missing.map(m => `
        <div class="db-checklist-item" onclick="navigateTo('${m.page}')">
          <span style="font-size:20px">${m.icon}</span>
          <div>
            <div style="font-weight:600">${m.label}</div>
            <div style="font-size:12px;color:var(--text-muted)">${m.sub}</div>
          </div>
          <span style="margin-left:auto;color:var(--primary);font-size:18px">›</span>
        </div>`).join('');
    } else {
      card.classList.add('hidden');
    }
  }
}
