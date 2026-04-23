/* Mandi Management — superadmin only */

let mmSelectedMandiId   = null;
let mmSelectedMandiName = null;

function mmDefaultFYDates() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = month >= 4 ? year : year - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

function mmFmtDate(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
}

/* ── Load & Render ─────────────────────────────── */

async function loadMandiManagement() {
  const { ok, data } = await api('GET', '/api/mandis');
  if (!ok) { showToast('Failed to load mandis', 'error'); return; }
  renderMandiCards(data);
}

function renderMandiCards(mandis) {
  const container = document.getElementById('mm-mandi-list');

  if (!mandis.length) {
    container.innerHTML = `
      <div class="card" style="max-width:700px;text-align:center;padding:40px 24px;color:var(--text-muted)">
        <div style="font-size:40px;margin-bottom:12px">🏪</div>
        <strong style="display:block;margin-bottom:6px">No mandis yet</strong>
        <span style="font-size:13px">Click "+ Add New Mandi" above to get started.</span>
      </div>`;
    return;
  }

  container.innerHTML = mandis.map(m => {
    const hasFY = !!m.active_fy;

    let statusHtml;
    if (hasFY) {
      // active_fy stored as code like "mandi_az_fy_202627" — show friendly label
      const label = m.active_fy.replace(/^mandi_[^_]+_fy_/, '').replace(/(\d{2})(\d{2})$/, '20$1-$2');
      statusHtml = `
        <div class="mm-fy-status ok">
          <span>✔ Active FY: ${escapeHtml(label)}</span>
          <span class="mm-fy-meta" id="mm-fy-meta-${m.id}">Loading dates…</span>
        </div>`;
    } else {
      statusHtml = `
        <div class="mm-fy-status err">
          ⚠ No financial year — operators cannot create gate passes
        </div>`;
    }

    return `
    <div class="mm-card" id="mm-card-${m.id}">
      <div class="mm-card-body">
        <div class="mm-card-top">
          <div style="display:flex;align-items:flex-start;gap:10px;flex:1">
            <span class="mm-prefix-badge">${escapeHtml(m.prefix)}</span>
            <div>
              <div class="mm-mandi-name">${escapeHtml(m.name)}</div>
              <div class="mm-mandi-meta">
                ${[m.address_line1, m.address_line2].filter(Boolean).map(escapeHtml).join(', ') || ''}
                ${m.phone ? `· 📞 ${escapeHtml(m.phone)}` : ''}
              </div>
            </div>
          </div>
          <div class="mm-card-actions">
            <button class="btn btn-ghost btn-sm" onclick="mmEditMandi(${m.id})">✏ Edit</button>
            <button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca" onclick="mmDeleteMandi(${m.id}, '${escapeHtml(m.name)}')">🗑 Delete</button>
          </div>
        </div>
        ${statusHtml}
      </div>

      <button class="mm-fy-toggle" id="mm-fy-toggle-${m.id}" onclick="mmToggleFYPanel(${m.id}, '${escapeHtml(m.name)}')">
        📅 Financial Years
        <span class="mm-fy-toggle-arrow">▼</span>
      </button>

      <div class="mm-fy-panel" id="mm-fy-panel-${m.id}">
        <div id="mm-fy-panel-content-${m.id}" style="color:var(--text-muted);font-size:13px">Loading…</div>
      </div>
    </div>`;
  }).join('');

  // Load FY date labels asynchronously for each active mandi
  mandis.filter(m => m.active_fy).forEach(m => loadActiveFYDates(m.id));
}

async function loadActiveFYDates(mandiId) {
  const el = document.getElementById(`mm-fy-meta-${mandiId}`);
  if (!el) return;
  const { ok, data } = await api('GET', `/api/mandis/${mandiId}/financial-years`);
  if (!ok) return;
  const active = data.financial_years.find(f => f.code === data.active_fy);
  if (active?.from_date && active?.to_date) {
    el.textContent = `${mmFmtDate(active.from_date)} → ${mmFmtDate(active.to_date)}`;
  } else {
    el.textContent = '';
  }
}

/* ── Inline FY Panel ───────────────────────────── */

const mmOpenPanels = new Set();

async function mmToggleFYPanel(mandiId, mandiName) {
  mmSelectedMandiId   = mandiId;
  mmSelectedMandiName = mandiName;

  const toggle  = document.getElementById(`mm-fy-toggle-${mandiId}`);
  const panel   = document.getElementById(`mm-fy-panel-${mandiId}`);
  const isOpen  = mmOpenPanels.has(mandiId);

  if (isOpen) {
    panel.classList.remove('open');
    toggle.classList.remove('open');
    mmOpenPanels.delete(mandiId);
  } else {
    panel.classList.add('open');
    toggle.classList.add('open');
    mmOpenPanels.add(mandiId);
    await mmRenderFYPanel(mandiId);
  }
}

async function mmRenderFYPanel(mandiId) {
  const content = document.getElementById(`mm-fy-panel-content-${mandiId}`);
  content.innerHTML = '<span style="color:var(--text-muted);font-size:13px">Loading…</span>';

  const { ok, data } = await api('GET', `/api/mandis/${mandiId}/financial-years`);
  if (!ok) { content.innerHTML = '<span style="color:var(--danger)">Failed to load financial years</span>'; return; }

  let html = '';

  if (!data.financial_years.length) {
    html += `<div style="color:var(--text-muted);font-size:13px;margin-bottom:14px;padding:12px;background:#fff;border-radius:8px;border:1px solid var(--border)">
      No financial years created yet.
    </div>`;
  } else {
    html += `<div style="margin-bottom:12px">`;
    for (const fy of data.financial_years) {
      const isActive = fy.code === data.active_fy;
      html += `
        <div class="mm-fy-row ${isActive ? 'active-fy' : ''}">
          <div class="mm-fy-label">${escapeHtml(fy.fy_label || fy.code)}</div>
          <div class="mm-fy-dates">
            ${fy.from_date && fy.to_date
              ? `${mmFmtDate(fy.from_date)} → ${mmFmtDate(fy.to_date)}`
              : '<span style="color:var(--text-muted)">No dates set</span>'}
          </div>
          <div class="mm-fy-actions">
            ${isActive
              ? `<span style="background:#dcfce7;color:#166534;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">✔ Active</span>`
              : `<button class="btn-xs green" onclick="mmSwitchFY('${fy.code}','${escapeHtml(fy.fy_label||fy.code)}')">Set Active</button>`}
            <button class="btn-xs red" onclick="mmDeleteFY('${fy.code}','${escapeHtml(fy.fy_label||fy.code)}')">🗑 Delete</button>
          </div>
        </div>`;
    }
    html += `</div>`;
  }

  html += `<button class="btn btn-primary btn-sm" onclick="mmOpenFYWizard()">+ Create New Financial Year</button>`;
  content.innerHTML = html;
}

/* ── FY Wizard ─────────────────────────────────── */

async function mmOpenFYWizard() {
  if (!mmSelectedMandiId) return;

  const defaults = mmDefaultFYDates();
  document.getElementById('fy-wiz-from').value = defaults.from;
  document.getElementById('fy-wiz-to').value   = defaults.to;
  document.getElementById('fy-wiz-mandi-label').textContent = `Mandi: ${mmSelectedMandiName}`;
  document.getElementById('fy-wiz-error').classList.add('hidden');

  document.getElementById('fy-wiz-step1').classList.remove('hidden');
  document.getElementById('fy-wiz-step2').classList.add('hidden');
  document.getElementById('fy-wiz-step3').classList.add('hidden');
  document.getElementById('fy-wizard-modal').classList.remove('hidden');

  // Load preview
  const previewBody = document.getElementById('fy-wiz-preview-body');
  previewBody.innerHTML = 'Loading…';
  const { ok, data } = await api('GET', `/api/mandis/${mmSelectedMandiId}/fy-preview`);
  if (ok && data.has_previous) {
    previewBody.innerHTML = `
      <span style="margin-right:16px">📦 ${data.commodities} Commodities</span>
      <span style="margin-right:16px">🏪 ${data.traders} Traders / Shops</span>
      <span>🚛 ${data.vehicle_types} Vehicle Types</span>
      <div style="margin-top:6px;font-size:11px;color:#166534">From: <code>${escapeHtml(data.previous_fy)}</code></div>`;
  } else {
    document.getElementById('fy-wiz-preview').style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:13px';
    previewBody.innerHTML = '<span style="color:var(--text-muted)">No previous FY — fresh database. Add commodities and traders after creation.</span>';
  }
}

/* ── Edit & Delete Mandi ───────────────────────── */

async function mmEditMandi(id) {
  const { ok, data } = await api('GET', '/api/mandis');
  if (!ok) return;
  const mandi = data.find(m => m.id === id);
  if (!mandi) return;

  document.getElementById('mm-edit-id').value      = mandi.id;
  document.getElementById('mm-edit-name').value    = mandi.name;
  document.getElementById('mm-edit-prefix').value  = mandi.prefix;
  document.getElementById('mm-edit-addr1').value   = mandi.address_line1 || '';
  document.getElementById('mm-edit-addr2').value   = mandi.address_line2 || '';
  document.getElementById('mm-edit-phone').value   = mandi.phone || '';
  document.getElementById('mm-edit-license').value = mandi.license_no || '';
  document.getElementById('mm-edit-title').textContent = `Edit — ${mandi.name}`;
  document.getElementById('mm-edit-error').classList.add('hidden');

  const addCard  = document.getElementById('mm-add-card');
  const editCard = document.getElementById('mm-edit-card');
  addCard.style.display  = 'none';
  editCard.style.display = '';
  editCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function mmDeleteMandi(id, name) {
  const confirmed = await showConfirm(
    `Delete mandi "${name}"?\n\nThis will permanently delete the mandi, ALL its financial year databases, and unassign its users. This cannot be undone.`,
    { title: 'Delete Mandi', confirmText: 'Delete', btnClass: 'btn btn-danger' }
  );
  if (!confirmed) return;

  const { ok, data } = await api('DELETE', `/api/mandis/${id}`);
  if (ok) {
    showToast(data.message || `Mandi "${name}" deleted`, 'success');
    loadMandiManagement();
    refreshMandiListEverywhere();
  } else {
    showToast(data.error || 'Failed to delete mandi', 'error');
  }
}

/* ── Delete FY ─────────────────────────────────── */

function mmDeleteFY(code, label) {
  const errDiv = document.getElementById('del-fy-error');
  document.getElementById('del-fy-label').textContent =
    `Permanently delete FY "${label}" (${code})?`;
  document.getElementById('del-fy-pwd').value = '';
  errDiv.classList.add('hidden');
  document.getElementById('del-fy-modal').classList.remove('hidden');
  document.getElementById('del-fy-pwd').focus();

  const modal      = document.getElementById('del-fy-modal');
  const confirmBtn = document.getElementById('del-fy-confirm');
  const cancelBtn  = document.getElementById('del-fy-cancel');

  function close() {
    modal.classList.add('hidden');
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    document.getElementById('del-fy-cancel').addEventListener('click', () => modal.classList.add('hidden'), { once: true });
  }

  document.getElementById('del-fy-cancel').addEventListener('click', close, { once: true });

  document.getElementById('del-fy-confirm').addEventListener('click', async () => {
    const pwd = document.getElementById('del-fy-pwd').value;
    if (!pwd) {
      errDiv.textContent = 'Password is required';
      errDiv.classList.remove('hidden');
      return;
    }
    const authRes = await api('POST', '/api/auth/verify-admin', { username: 'superadmin', password: pwd });
    if (!authRes.ok) {
      errDiv.textContent = 'Incorrect superadmin password';
      errDiv.classList.remove('hidden');
      return;
    }
    close();
    const { ok, data } = await api('DELETE', `/api/mandis/${mmSelectedMandiId}/fy/${code}`);
    if (ok) {
      showToast(`FY "${label}" deleted`, 'success');
      await mmRenderFYPanel(mmSelectedMandiId);
      loadMandiManagement();
    } else {
      showToast(data.error || 'Failed to delete FY', 'error');
    }
  }, { once: true });
}

/* ── Switch FY ─────────────────────────────────── */

async function mmSwitchFY(code, label) {
  const confirmed = await showConfirm(
    `Switch to financial year "${label}"?\n\nAll new entries will go into this year's database. Old data stays safe.`,
    { title: 'Switch Financial Year', confirmText: 'Switch', btnClass: 'btn btn-primary' }
  );
  if (!confirmed) return;

  const { ok, data } = await api('POST', `/api/mandis/${mmSelectedMandiId}/switch-fy`, { code });
  if (ok) {
    showToast(`Switched to FY ${label}`, 'success');
    await mmRenderFYPanel(mmSelectedMandiId);
    loadMandiManagement();
  } else {
    showToast(data.error || 'Failed to switch FY', 'error');
  }
}

/* ── Init ──────────────────────────────────────── */

function initMandiManagementModule() {
  // Toggle add form
  document.getElementById('mm-add-btn').addEventListener('click', () => {
    const card    = document.getElementById('mm-add-card');
    const visible = card.style.display !== 'none';
    card.style.display = visible ? 'none' : '';
    document.getElementById('mm-edit-card').style.display = 'none';
    if (!visible) {
      document.getElementById('mm-add-form').reset();
      document.getElementById('mm-add-error').classList.add('hidden');
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  ['mm-add-cancel','mm-add-cancel2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => { document.getElementById('mm-add-card').style.display = 'none'; });
  });
  ['mm-edit-cancel','mm-edit-cancel2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => { document.getElementById('mm-edit-card').style.display = 'none'; });
  });

  // Add mandi
  document.getElementById('mm-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errDiv = document.getElementById('mm-add-error');
    errDiv.classList.add('hidden');

    const name       = document.getElementById('mm-name').value.trim();
    const prefix     = document.getElementById('mm-prefix').value.trim().toUpperCase();
    const address_line1 = document.getElementById('mm-addr1').value.trim();
    const address_line2 = document.getElementById('mm-addr2').value.trim();
    const phone      = document.getElementById('mm-phone').value.trim();
    const license_no = document.getElementById('mm-license').value.trim();

    if (!name || !prefix) {
      errDiv.textContent = 'Mandi name and prefix are required';
      errDiv.classList.remove('hidden');
      return;
    }

    const btn = document.getElementById('mm-add-submit');
    btn.disabled = true; btn.textContent = 'Adding…';

    const { ok, data } = await api('POST', '/api/mandis', { name, prefix, address_line1, address_line2, phone, license_no });
    btn.disabled = false; btn.textContent = 'Add Mandi';

    if (ok) {
      document.getElementById('mm-add-form').reset();
      document.getElementById('mm-add-card').style.display = 'none';
      showToast(`Mandi "${data.name}" added. Open Financial Years to create a new FY.`, 'success');
      loadMandiManagement();
      refreshMandiListEverywhere();
    } else {
      errDiv.textContent = data.error || 'Failed to add mandi';
      errDiv.classList.remove('hidden');
    }
  });

  // Edit mandi
  document.getElementById('mm-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errDiv = document.getElementById('mm-edit-error');
    errDiv.classList.add('hidden');

    const id   = document.getElementById('mm-edit-id').value;
    const name = document.getElementById('mm-edit-name').value.trim();
    if (!name) {
      errDiv.textContent = 'Mandi name is required';
      errDiv.classList.remove('hidden');
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving…';

    const { ok, data } = await api('PUT', `/api/mandis/${id}`, {
      name,
      address_line1: document.getElementById('mm-edit-addr1').value.trim(),
      address_line2: document.getElementById('mm-edit-addr2').value.trim(),
      phone:         document.getElementById('mm-edit-phone').value.trim(),
      license_no:    document.getElementById('mm-edit-license').value.trim(),
    });

    btn.disabled = false; btn.textContent = 'Save Changes';

    if (ok) {
      document.getElementById('mm-edit-card').style.display = 'none';
      showToast('Mandi updated successfully', 'success');
      loadMandiManagement();
      refreshMandiListEverywhere();
    } else {
      errDiv.textContent = data.error || 'Failed to update mandi';
      errDiv.classList.remove('hidden');
    }
  });

  // Wizard: cancel / close / done
  document.getElementById('fy-wiz-close').addEventListener('click', () =>
    document.getElementById('fy-wizard-modal').classList.add('hidden'));
  document.getElementById('fy-wiz-cancel').addEventListener('click', () =>
    document.getElementById('fy-wizard-modal').classList.add('hidden'));
  document.getElementById('fy-wiz-done').addEventListener('click', () =>
    document.getElementById('fy-wizard-modal').classList.add('hidden'));

  // Wizard: start FY
  document.getElementById('fy-wiz-start').addEventListener('click', async () => {
    const from_date = document.getElementById('fy-wiz-from').value;
    const to_date   = document.getElementById('fy-wiz-to').value;
    const errDiv    = document.getElementById('fy-wiz-error');
    errDiv.classList.add('hidden');

    if (!from_date || !to_date) {
      errDiv.textContent = 'Please select both From Date and To Date';
      errDiv.classList.remove('hidden');
      return;
    }
    if (from_date >= to_date) {
      errDiv.textContent = 'To Date must be after From Date';
      errDiv.classList.remove('hidden');
      return;
    }

    document.getElementById('fy-wiz-step1').classList.add('hidden');
    document.getElementById('fy-wiz-step2').classList.remove('hidden');

    const { ok, data } = await api('POST', `/api/mandis/${mmSelectedMandiId}/new-fy`, { from_date, to_date });

    if (!ok) {
      document.getElementById('fy-wiz-step2').classList.add('hidden');
      document.getElementById('fy-wiz-step1').classList.remove('hidden');
      errDiv.textContent = data.error || 'Failed to start new FY';
      errDiv.classList.remove('hidden');
      return;
    }

    const fromYear = new Date(from_date).getFullYear();
    const toYear   = new Date(to_date).getFullYear();
    const fyLabel  = data.fy_label || `${fromYear}-${String(toYear).slice(-2)}`;
    const c        = data.copied || {};

    document.getElementById('fy-wiz-success-label').textContent =
      `FY ${fyLabel}  ·  ${mmFmtDate(from_date)} → ${mmFmtDate(to_date)}  ·  ${mmSelectedMandiName}`;

    const copiedBox = document.getElementById('fy-wiz-copied-box');
    if (c.commodities || c.traders || c.vehicle_types) {
      copiedBox.innerHTML = `
        <div style="font-weight:600;color:#166534;margin-bottom:6px">✔ Copied from previous FY:</div>
        <div style="color:#15803d">
          📦 ${c.commodities} Commodities &nbsp;|&nbsp;
          🏪 ${c.traders} Traders &nbsp;|&nbsp;
          🚛 ${c.vehicle_types} Vehicle Types
        </div>`;
    } else {
      copiedBox.innerHTML = `<div style="color:var(--text-muted);font-size:13px">Fresh database — add commodities and traders to get started.</div>`;
    }

    document.getElementById('fy-wiz-step2').classList.add('hidden');
    document.getElementById('fy-wiz-step3').classList.remove('hidden');

    // Refresh panel and card list
    await mmRenderFYPanel(mmSelectedMandiId);
    loadMandiManagement();
  });
}
