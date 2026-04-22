/* Admin SQL / Database Viewer */

let adbOffset = 0;
const ADB_LIMIT = 100;
let adbTotal = 0;

async function initAdminSqlModule() {
  await adbLoadFYList();
  await adbLoadDatabases();

  document.getElementById('adb-db-select').addEventListener('change', adbLoadTables);
  document.getElementById('adb-load-btn').addEventListener('click', () => {
    adbOffset = 0;
    adbLoadData();
  });
}

async function adbLoadFYList() {
  const { ok, data } = await api('GET', '/api/admin-db/financial-years');
  if (!ok) return;

  const list = document.getElementById('adb-fy-list');
  const activeLabel = document.getElementById('adb-active-label');

  activeLabel.textContent = `${data.financial_years.length} financial year(s) across all mandis`;
  list.innerHTML = '';

  if (!data.financial_years.length) {
    list.innerHTML = '<span style="font-size:13px;color:var(--text-muted)">No financial years found. Use Mandi Management to start one.</span>';
    return;
  }

  for (const fy of data.financial_years) {
    const isActive = fy.active_fy === fy.code;
    const span = document.createElement('span');
    span.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin:2px';
    span.innerHTML = `
      <span class="badge ${isActive ? 'badge-success' : ''}" style="font-size:11px;cursor:default" title="Mandi: ${escapeHtml(fy.mandi_name || '?')} | Code: ${escapeHtml(fy.code)}">
        ${escapeHtml(fy.mandi_name || '?')} · ${escapeHtml(fy.fy_label || fy.code)}${isActive ? ' ✔' : ''}
      </span>
    `;
    list.appendChild(span);
  }
}

async function adbLoadDatabases() {
  const { ok, data } = await api('GET', '/api/admin-db/databases');
  const sel = document.getElementById('adb-db-select');
  sel.innerHTML = '<option value="">— select database —</option>';
  if (!ok) return;
  for (const db of data.databases) {
    const opt = document.createElement('option');
    opt.value = db;
    opt.textContent = db;
    sel.appendChild(opt);
  }
}

async function adbLoadTables() {
  const db = document.getElementById('adb-db-select').value;
  const sel = document.getElementById('adb-table-select');
  sel.innerHTML = '<option value="">— select table —</option>';
  if (!db) return;

  const { ok, data } = await api('GET', `/api/admin-db/tables?db=${encodeURIComponent(db)}`);
  if (!ok) return;
  for (const t of data.tables) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  }
}

async function adbLoadData() {
  const db    = document.getElementById('adb-db-select').value;
  const table = document.getElementById('adb-table-select').value;
  const info  = document.getElementById('adb-info');
  const wrapper = document.getElementById('adb-table-wrapper');

  if (!db || !table) { info.textContent = 'Select a database and table first.'; return; }

  info.textContent = 'Loading…';
  wrapper.style.display = 'none';

  const { ok, data } = await api('GET',
    `/api/admin-db/data?db=${encodeURIComponent(db)}&table=${encodeURIComponent(table)}&limit=${ADB_LIMIT}&offset=${adbOffset}`
  );

  if (!ok) { info.textContent = data.error || 'Failed to load data'; return; }

  adbTotal = data.total;
  info.textContent = `Showing rows ${adbOffset + 1}–${Math.min(adbOffset + ADB_LIMIT, adbTotal)} of ${adbTotal} total`;

  const rows = data.rows;
  if (!rows.length) { info.textContent = 'No rows found.'; return; }

  const cols = Object.keys(rows[0]);

  // Build header
  const thead = document.getElementById('adb-thead');
  thead.innerHTML = '<tr>' + cols.map(c => `<th>${escapeHtml(c)}</th>`).join('') + '</tr>';

  // Build body
  const tbody = document.getElementById('adb-tbody');
  tbody.innerHTML = rows.map(row =>
    '<tr>' + cols.map(c => `<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(String(row[c] ?? ''))}">${escapeHtml(String(row[c] ?? ''))}</td>`).join('') + '</tr>'
  ).join('');

  wrapper.style.display = '';

  // Pagination
  const pg = document.getElementById('adb-pagination');
  pg.innerHTML = '';
  if (adbOffset > 0) {
    const prev = document.createElement('button');
    prev.className = 'btn btn-ghost btn-sm';
    prev.textContent = '← Prev';
    prev.addEventListener('click', () => { adbOffset = Math.max(0, adbOffset - ADB_LIMIT); adbLoadData(); });
    pg.appendChild(prev);
  }
  if (adbOffset + ADB_LIMIT < adbTotal) {
    const next = document.createElement('button');
    next.className = 'btn btn-ghost btn-sm';
    next.textContent = 'Next →';
    next.addEventListener('click', () => { adbOffset += ADB_LIMIT; adbLoadData(); });
    pg.appendChild(next);
  }
}
