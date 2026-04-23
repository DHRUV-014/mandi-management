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
      <div class="db-mandi-card ${allDone ? '' : 'db-mandi-card-warn'}" data-mandi-id="${m.id}">
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
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-sm btn-ghost" onclick="dbToggleFYHistory(${m.id})">📂 Past FYs</button>
          <button class="btn btn-sm btn-ghost" onclick="navigateTo('mandi-management')">Manage →</button>
        </div>
      </div>
      <div class="db-fy-history hidden" id="db-fy-hist-${m.id}" style="margin:-4px 0 14px;padding:12px 16px;background:#f8fafc;border:1px solid var(--border);border-radius:8px">
        Loading financial years…
      </div>`;
  }).join('');
}

/* ── Past-FY viewer (superadmin dashboard) ──────────── */

async function dbToggleFYHistory(mandiId) {
  const panel = document.getElementById(`db-fy-hist-${mandiId}`);
  if (!panel) return;
  const isOpen = !panel.classList.contains('hidden');
  if (isOpen) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  panel.innerHTML = 'Loading financial years…';

  const { ok, data } = await api('GET', `/api/mandis/${mandiId}/financial-years`);
  if (!ok) { panel.innerHTML = '<span style="color:var(--danger)">Failed to load FYs</span>'; return; }

  if (!data.financial_years.length) {
    panel.innerHTML = `<div style="color:var(--text-muted);font-size:13px">No financial years created yet. Go to <a href="#" onclick="navigateTo('mandi-management')" style="color:var(--primary)">Mandi Management</a> to create one.</div>`;
    return;
  }

  const rows = data.financial_years.map(fy => {
    const isActive = fy.code === data.active_fy;
    const from = fy.from_date ? String(fy.from_date).slice(0, 10) : null;
    const to   = fy.to_date   ? String(fy.to_date).slice(0, 10)   : null;
    const range = (from && to) ? `${formatDateDMY(from)} → ${formatDateDMY(to)}` : '<span style="color:var(--text-muted)">no dates</span>';
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#fff;border:1px solid var(--border);border-radius:6px;margin-bottom:6px">
        <div style="flex:1;font-size:13px">
          <strong>${escapeHtml(fy.fy_label || fy.code)}</strong>
          ${isActive ? '<span style="margin-left:6px;background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">✔ ACTIVE</span>' : ''}
          <span style="margin-left:8px;color:var(--text-muted);font-size:12px">${range}</span>
        </div>
        <button class="btn btn-sm btn-primary" onclick="dbOpenFYData(${mandiId}, '${escapeHtml(fy.code)}', '${escapeHtml(fy.fy_label || fy.code)}')">View Data</button>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">All financial years for this mandi — click <strong>View Data</strong> to browse reports, gate passes and rates from that FY.</div>
    ${rows}`;
}

async function dbOpenFYData(mandiId, fyCode, fyLabel) {
  // 1. Make this mandi the active context
  let r = await api('POST', '/api/auth/switch-mandi', { mandi_id: mandiId });
  if (!r.ok) { showToast('Failed to switch mandi', 'error'); return; }
  state.user.current_mandi_id = mandiId;
  notifyLiveMandiChange(mandiId);

  // 2. Set the viewing FY for this session
  r = await api('POST', '/api/fy/select', { code: fyCode });
  if (!r.ok) { showToast(r.data?.error || 'Failed to switch FY', 'error'); return; }

  showToast(`Viewing data for ${fyLabel}`, 'info');

  // 3. Reload full context and land on Gate Pass page (most useful starting point)
  await reloadCurrentContext();
  navigateTo('gate-pass');
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
