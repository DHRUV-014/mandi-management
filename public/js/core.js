/* ============================================================
   MANDI — Core utilities (state, api, toast, confirm, escape)
   ============================================================ */

const state = {
  user: null,
  currentPage: 'dashboard',
  profile: {},
};

const ALL_FEATURES = ['gate_pass','rate_entry','reports','commodity_master','trader_master','vehicle_type_master','state_master','user_management','view_past_fy'];
const DEFAULT_USER_FEATURES = ['gate_pass','rate_entry','reports'];

function hasPermission(feature) {
  if (!state.user) return false;
  if (state.user.level === 'superadmin') return true;
  const perms = state.user.permissions;
  if (!perms) {
    if (state.user.level === 'admin') return true;
    return DEFAULT_USER_FEATURES.includes(feature);
  }
  return Array.isArray(perms) && perms.includes(feature);
}

// Returns true if superadmin has selected a mandi context, or user always has context
function hasMandiContext() {
  if (!state.user) return false;
  if (state.user.level === 'superadmin') return !!state.user.current_mandi_id;
  return !!state.user.mandi_id;
}

// Show "no active FY" notice inside a table body (colspan = number of columns)
function showNoFYNotice(tbodyId, colspan) {
  const el = document.getElementById(tbodyId);
  if (el) el.innerHTML = `<tr class="empty-row"><td colspan="${colspan}" style="text-align:center;color:var(--danger);padding:24px">
    &#9888; No active financial year for this mandi. Ask the superadmin to set one up.
  </td></tr>`;
}

// Show an inline "select mandi" notice inside the given element id; returns false
function showNoMandiNotice(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:48px 24px;color:var(--text-muted)">
      <div style="text-align:center;max-width:320px">
        <div style="font-size:36px;margin-bottom:12px">🏪</div>
        <div style="font-weight:600;color:var(--text);margin-bottom:6px">No mandi selected</div>
        <div style="font-size:13px">Use the context bar above to select a mandi and continue.</div>
      </div>
    </div>`;
  return false;
}

async function api(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✔', error: '✖', info: 'ℹ' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);

  toast.addEventListener('click', () => removeToast(toast));

  setTimeout(() => removeToast(toast), 4000);
}

function removeToast(toast) {
  if (toast.classList.contains('removing')) return;
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 300);
}

function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    document.getElementById('confirm-message').textContent = message;

    titleEl.textContent = options.title || 'Confirm Delete';
    const yes = document.getElementById('confirm-yes');
    yes.textContent = options.confirmText || 'Delete';
    yes.className = options.btnClass || 'btn btn-danger';

    const no = document.getElementById('confirm-no');
    modal.classList.remove('hidden');

    const cleanup = (result) => {
      modal.classList.add('hidden');
      yes.replaceWith(yes.cloneNode(true));
      no.replaceWith(no.cloneNode(true));
      resolve(result);
    };

    document.getElementById('confirm-yes').addEventListener('click', () => cleanup(true));
    document.getElementById('confirm-no').addEventListener('click', () => cleanup(false));
    modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(false); }, { once: true });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Show admin auth modal; resolves true if admin credentials verified, false if cancelled
function requireAdminAuth(message) {
  return new Promise(resolve => {
    document.getElementById('admin-auth-msg').textContent = message;
    document.getElementById('aa-username').value = '';
    document.getElementById('aa-password').value = '';
    document.getElementById('aa-error').classList.add('hidden');
    const modal = document.getElementById('admin-auth-modal');
    modal.classList.remove('hidden');

    const form   = document.getElementById('admin-auth-form');
    const cancel = document.getElementById('aa-cancel');

    function cleanup() {
      modal.classList.add('hidden');
      form.removeEventListener('submit', onSubmit);
      cancel.removeEventListener('click', onCancel);
    }

    async function onSubmit(e) {
      e.preventDefault();
      const username = document.getElementById('aa-username').value.trim();
      const password = document.getElementById('aa-password').value;
      const errDiv   = document.getElementById('aa-error');
      errDiv.classList.add('hidden');
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      const { ok } = await api('POST', '/api/auth/verify-admin', { username, password });
      btn.disabled = false;
      if (ok) { cleanup(); resolve(true); }
      else { errDiv.textContent = 'Invalid admin credentials'; errDiv.classList.remove('hidden'); }
    }

    function onCancel() { cleanup(); resolve(false); }

    form.addEventListener('submit', onSubmit);
    cancel.addEventListener('click', onCancel);
  });
}

// Global Enter-key navigation: pressing Enter in any text/number/select/password
// input moves focus to the next focusable field in the same container.
// Works for inputs inside <form> tags AND standalone inputs (gate pass, reports, etc.).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;

  const el = e.target;
  const tag = el.tagName;

  // Only intercept inputs and selects that are not textareas
  if (tag === 'TEXTAREA') return;
  if (tag !== 'INPUT' && tag !== 'SELECT') return;

  // Let submit buttons, checkboxes, radios fire normally
  const type = (el.type || '').toLowerCase();
  if (type === 'submit' || type === 'button' || type === 'checkbox' || type === 'radio') return;

  // Find the scoping container: prefer form, then card, then active page
  const container = el.closest('form')
    || el.closest('.card')
    || el.closest('.page.active')
    || document.body;

  // Collect all focusable fields in this container, in DOM order
  const focusable = Array.from(
    container.querySelectorAll(
      'input:not([disabled]):not([type="hidden"]):not([readonly]):not([tabindex="-1"]), ' +
      'select:not([disabled]), ' +
      'textarea:not([disabled])'
    )
  ).filter(f => {
    // Skip hidden (via .hidden class or display:none)
    return f.offsetParent !== null && !f.closest('.hidden');
  });

  const idx = focusable.indexOf(el);
  if (idx === -1) return;

  if (idx < focusable.length - 1) {
    e.preventDefault();
    focusable[idx + 1].focus();
  } else if (!el.closest('form')) {
    // Not inside a form and last field — just prevent default (no submission)
    e.preventDefault();
  }
  // If inside a form and last field: let the form submit naturally
});

/* ============================================================
   Live updates: WebSocket client + global context reload
   ============================================================ */

let _ws = null;
let _wsReconnectTimer = null;
let _wsCurrentMandiId = null;

function connectLiveUpdates() {
  if (!state.user) return;
  try { if (_ws && _ws.readyState <= 1) _ws.close(); } catch (_) {}

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws`;
  _ws = new WebSocket(url);

  _ws.onopen = () => {
    if (_wsReconnectTimer) { clearTimeout(_wsReconnectTimer); _wsReconnectTimer = null; }
    const mandiId = state.user?.current_mandi_id || state.user?.mandi_id || null;
    _wsCurrentMandiId = mandiId;
    try { _ws.send(JSON.stringify({ type: 'set_mandi', mandi_id: mandiId })); } catch (_) {}
  };

  _ws.onmessage = (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
    handleLiveEvent(msg);
  };

  _ws.onclose = () => {
    _ws = null;
    if (!state.user) return;  // logged out — don't reconnect
    if (_wsReconnectTimer) return;
    _wsReconnectTimer = setTimeout(() => { _wsReconnectTimer = null; connectLiveUpdates(); }, 3000);
  };

  _ws.onerror = () => { try { _ws.close(); } catch (_) {} };
}

function disconnectLiveUpdates() {
  if (_wsReconnectTimer) { clearTimeout(_wsReconnectTimer); _wsReconnectTimer = null; }
  if (_ws) { try { _ws.close(); } catch (_) {} _ws = null; }
}

function notifyLiveMandiChange(mandiId) {
  _wsCurrentMandiId = mandiId;
  if (_ws && _ws.readyState === 1) {
    try { _ws.send(JSON.stringify({ type: 'set_mandi', mandi_id: mandiId })); } catch (_) {}
  }
}

function handleLiveEvent(msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'fy-created' || msg.type === 'fy-switched') {
    showFYChangePopup(msg);
  }
}

// Single entry point to re-hydrate the session and reload whatever page is visible.
// Invoked after mandi switch, FY select, or an inbound fy-* WS event.
async function reloadCurrentContext() {
  try {
    const { ok, data } = await api('GET', '/api/auth/me');
    if (ok && data.user) state.user = data.user;
  } catch (_) {}
  try { await loadMandiProfile(); } catch (_) {}
  try { await updateContextFYBadge(); } catch (_) {}
  try { await refreshFYSelector(); } catch (_) {}
  try { await refreshFYBounds(); } catch (_) {}
  if (typeof navigateTo === 'function' && state.currentPage) {
    navigateTo(state.currentPage);
  }
}

// Refresh the global mandi list (context bar dropdown + dashboard cards) without
// reloading the current page. Called after mandi add/edit/delete from Mandi Management.
async function refreshMandiListEverywhere() {
  try { if (typeof initContextBar === 'function') await initContextBar(); } catch (_) {}
  try { if (typeof loadDashboard === 'function') await loadDashboard(); } catch (_) {}
  try { await refreshFYSelector(); } catch (_) {}
  try { await updateContextFYBadge(); } catch (_) {}
  try { await refreshFYBounds(); } catch (_) {}
}

/* ============================================================
   FY date-range clamping
   Every <input type="date"> gets min/max set to the currently-viewed
   FY's from_date / to_date. Out-of-range input is rejected inline.
   ============================================================ */

state.fyBounds = { from: null, to: null, label: null, code: null };

async function refreshFYBounds() {
  // If there's no mandi context, clear bounds
  const mandiId = state.user?.current_mandi_id || state.user?.mandi_id;
  if (!state.user || !mandiId) {
    state.fyBounds = { from: null, to: null, label: null, code: null };
    applyFYBoundsToInputs();
    return;
  }
  try {
    const { ok, data } = await api('GET', '/api/fy/list');
    if (!ok) return;
    // The effective FY is the one currently being viewed (selected_fy) or the active one.
    const effective = data.selected_fy || data.active_fy;
    const fy = data.financial_years?.find(f => f.code === effective);
    if (fy && fy.from_date && fy.to_date) {
      state.fyBounds = {
        from:  String(fy.from_date).slice(0, 10),
        to:    String(fy.to_date).slice(0, 10),
        label: fy.fy_label || fy.code,
        code:  fy.code,
      };
    } else {
      state.fyBounds = { from: null, to: null, label: null, code: null };
    }
  } catch (_) { /* leave bounds as-is */ }
  applyFYBoundsToInputs();
}

function applyFYBoundsToInputs() {
  const b = state.fyBounds;
  document.querySelectorAll('input[type="date"]').forEach(input => {
    if (b && b.from && b.to) {
      input.min = b.from;
      input.max = b.to;
      input.dataset.fyClamped = '1';
    } else {
      input.removeAttribute('min');
      input.removeAttribute('max');
      delete input.dataset.fyClamped;
    }
  });
}

function formatDateDMY(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// Returns true if the date string is within the active FY (inclusive). If no FY
// is configured we return true so we don't block entry in pre-FY setup.
function isDateInFY(iso) {
  const b = state.fyBounds;
  if (!b || !b.from || !b.to || !iso) return true;
  return iso >= b.from && iso <= b.to;
}

function showFYBoundsToast() {
  const b = state.fyBounds;
  if (!b || !b.from || !b.to) return;
  showToast(`Date is outside your active financial year (${b.label}: ${formatDateDMY(b.from)} → ${formatDateDMY(b.to)}). Pick a date inside this range.`, 'error');
}

// Global listener: any out-of-range value on a clamped date input is rejected.
// We don't silently clamp — we toast and clear so the user knows why.
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.tagName !== 'INPUT' || el.type !== 'date') return;
  if (!el.dataset.fyClamped) return;
  const val = el.value;
  if (!val) return;
  if (!isDateInFY(val)) {
    showFYBoundsToast();
    el.classList.add('error');
    el.value = '';
    setTimeout(() => el.classList.remove('error'), 2000);
  }
}, true);

// Re-apply bounds every time the page changes (new date inputs may have appeared).
// Wrap navigateTo so every page switch reapplies after the DOM settles.
let _wrappedNavigate = false;
function installFYBoundsNavHook() {
  if (_wrappedNavigate || typeof navigateTo !== 'function') return;
  const original = navigateTo;
  window.navigateTo = function (page) {
    const r = original(page);
    setTimeout(applyFYBoundsToInputs, 0);
    return r;
  };
  _wrappedNavigate = true;
}

/* ── FY-change popup ──────────────────────────── */

function showFYChangePopup(ev) {
  const existing = document.getElementById('fy-change-modal');
  if (existing) existing.remove();

  const fromStr = ev.from_date ? String(ev.from_date).slice(0, 10) : '';
  const toStr   = ev.to_date   ? String(ev.to_date).slice(0, 10)   : '';
  const title   = ev.type === 'fy-created' ? 'New Financial Year Created' : 'Active Financial Year Changed';
  const icon    = ev.type === 'fy-created' ? '&#128197;' : '&#128257;';
  const body    = ev.type === 'fy-created'
    ? `Your admin just created a new financial year.<br><strong>${escapeHtml(ev.fy_label || ev.fy_code || '')}</strong>${fromStr && toStr ? ` <span style="color:var(--text-muted)">(${fromStr} → ${toStr})</span>` : ''}<br><br>New gate passes and rates dated within this FY will be stored in the new database automatically.`
    : `The active financial year for <strong>${escapeHtml(ev.mandi_name || 'this mandi')}</strong> is now <strong>${escapeHtml(ev.fy_label || ev.fy_code || '')}</strong>${fromStr && toStr ? ` <span style="color:var(--text-muted)">(${fromStr} → ${toStr})</span>` : ''}.`;

  const overlay = document.createElement('div');
  overlay.id = 'fy-change-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-icon" style="color:var(--primary)">${icon}</div>
      <h3>${title}</h3>
      <p style="margin-bottom:16px;line-height:1.6">${body}</p>
      <div class="modal-actions">
        <button class="btn btn-primary" id="fy-change-ok">Reload &amp; Continue</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('fy-change-ok').addEventListener('click', async () => {
    overlay.remove();
    showToast('Refreshing with the new financial year…', 'info');
    await reloadCurrentContext();
  });
}

function openPrintWindow(html, triggerPrint) {
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) {
    showToast('Pop-up blocked! Please allow pop-ups for this site.', 'error');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    if (triggerPrint) {
      win.print();
      win.addEventListener('afterprint', () => win.close());
    }
  };
}
