/* ============================================================
   MANDI — Daily Rate Entry (Enter + View tabs)
   ============================================================ */

function initRatesModule() {
  const today = todayISO();

  // ── Tab switching ───────────────────────────────────────
  const tabEntry = document.getElementById('rate-tab-entry');
  const tabView  = document.getElementById('rate-tab-view');
  const panelEntry = document.getElementById('rate-panel-entry');
  const panelView  = document.getElementById('rate-panel-view');

  function switchTab(active) {
    const isEntry = active === 'entry';
    tabEntry.style.color        = isEntry ? 'var(--primary)' : 'var(--text-muted)';
    tabEntry.style.borderBottom = isEntry ? '2px solid var(--primary)' : '2px solid transparent';
    tabView.style.color         = isEntry ? 'var(--text-muted)' : 'var(--primary)';
    tabView.style.borderBottom  = isEntry ? '2px solid transparent' : '2px solid var(--primary)';
    panelEntry.style.display    = isEntry ? '' : 'none';
    panelView.style.display     = isEntry ? 'none' : '';
  }

  tabEntry.addEventListener('click', () => switchTab('entry'));
  tabView.addEventListener('click',  () => switchTab('view'));

  // ── TAB 1: Enter Rates ──────────────────────────────────
  const dateInput  = document.getElementById('rate-date');
  const fetchBtn   = document.getElementById('rate-fetch-btn');
  const entryCard  = document.getElementById('rate-entry-card');
  const entryTitle = document.getElementById('rate-entry-title');
  const countBadge = document.getElementById('rate-commodity-count');
  const arrivedBadge = document.getElementById('rate-arrived-count');
  const noData     = document.getElementById('rate-no-data');
  const tableWrap  = document.getElementById('rate-table-wrap');
  const tbody      = document.getElementById('rate-tbody');
  const saveBtn    = document.getElementById('rate-save-btn');

  dateInput.value = today;

  fetchBtn.addEventListener('click', async () => {
    const date = dateInput.value;
    if (!date) { dateInput.classList.add('error'); return; }
    dateInput.classList.remove('error');

    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Loading…';

    // Only commodities that actually arrived on this date should get rates.
    const { ok, data } = await api('GET', `/api/rates/by-date?date=${date}`);
    fetchBtn.disabled = false;
    fetchBtn.innerHTML = '&#128269; Fetch Commodities';

    if (!ok) { showToast('Failed to fetch commodities', 'error'); return; }

    entryCard.style.display = '';
    entryTitle.textContent  = `Rates for ${formatDisplayDate(date)}`;

    if (data.commodities.length === 0) {
      countBadge.textContent     = '0 commodities';
      arrivedBadge.style.display = 'none';
      noData.style.display       = '';
      noData.textContent         = `No commodities arrived on ${formatDisplayDate(date)}. Rates can only be entered for commodities that came through the gate.`;
      tableWrap.style.display    = 'none';
      return;
    }

    noData.style.display    = 'none';
    tableWrap.style.display = '';
    countBadge.textContent  = `${data.commodities.length} arrived commodit${data.commodities.length !== 1 ? 'ies' : 'y'}`;
    arrivedBadge.textContent   = `${data.commodities.length} arrived`;
    arrivedBadge.style.display = '';

    tbody.innerHTML = data.commodities.map((c, i) => {
      const existing = data.rates[c.id] !== undefined ? data.rates[c.id] : '';
      const saved    = data.rates[c.id] !== undefined;
      return `<tr data-id="${c.id}">
        <td style="text-align:center;color:var(--text-muted)">${i + 1}</td>
        <td>
          <strong>${escapeHtml(c.commodity_name)}</strong>
          <span style="font-size:11px;color:var(--text-muted);margin-left:6px">${escapeHtml(c.short_name)}</span>
          <span style="font-size:10px;background:#dcfce7;color:#16a34a;border-radius:4px;padding:1px 6px;margin-left:6px;font-weight:600">Arrived</span>
        </td>
        <td>${escapeHtml(c.unit)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="color:var(--text-muted)">₹</span>
            <input
              type="number"
              class="rate-input"
              min="0"
              step="0.01"
              placeholder="0.00"
              value="${existing}"
              style="width:120px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;outline:none"
            />
          </div>
        </td>
        <td>
          <span class="rate-status-badge ${saved ? 'rate-saved' : 'rate-pending'}">
            ${saved ? '&#10003; Saved' : '— Not set'}
          </span>
        </td>
      </tr>`;
    }).join('');

    // Focus first empty rate input
    const first = tbody.querySelector('.rate-input:not([value])') ||
                  tbody.querySelector('.rate-input[value=""]');
    if (first) first.focus();

    // Enter key moves to next rate input
    const inputs = [...tbody.querySelectorAll('.rate-input')];
    inputs.forEach((input, idx) => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (idx < inputs.length - 1) inputs[idx + 1].focus();
          else saveBtn.focus();
        }
      });
      // Highlight row on focus
      input.addEventListener('focus', () => input.closest('tr').style.background = 'var(--primary-light, #f0fdf4)');
      input.addEventListener('blur',  () => input.closest('tr').style.background = '');
    });
  });

  // ── Save rates ────────────────────────────────────────────
  saveBtn.addEventListener('click', async () => {
    const date = dateInput.value;
    const rows = [...tbody.querySelectorAll('tr[data-id]')];

    const rates = {};
    let hasValue = false;

    rows.forEach(row => {
      const id    = row.dataset.id;
      const input = row.querySelector('.rate-input');
      const val   = input.value.trim();
      if (val !== '' && !isNaN(parseFloat(val))) {
        rates[id] = parseFloat(val);
        hasValue = true;
      }
    });

    if (!hasValue) {
      showToast('Please enter at least one rate', 'error');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    const { ok } = await api('POST', '/api/rates/save', { date, rates });
    saveBtn.disabled = false;
    saveBtn.innerHTML = '&#10003; Save Rates';

    if (!ok) { showToast('Failed to save rates', 'error'); return; }

    showToast(`Rates saved successfully for ${formatDisplayDate(date)}`, 'success');

    // Update status badges inline
    rows.forEach(row => {
      const id    = row.dataset.id;
      const badge = row.querySelector('.rate-status-badge');
      if (rates[id] !== undefined) {
        badge.className = 'rate-status-badge rate-saved';
        badge.innerHTML = '&#10003; Saved';
      }
    });
  });

  // ── TAB 2: View Saved Rates ──────────────────────────────
  const viewFromInput  = document.getElementById('rate-view-from');
  const viewToInput    = document.getElementById('rate-view-to');
  const viewFetchBtn   = document.getElementById('rate-view-fetch-btn');
  const historyResult  = document.getElementById('rate-history-result');
  const historyEmpty   = document.getElementById('rate-history-empty');

  // Default to last 7 days
  viewFromInput.value = offsetDate(today, -7);
  viewToInput.value   = today;

  viewFetchBtn.addEventListener('click', async () => {
    const from = viewFromInput.value;
    const to   = viewToInput.value;
    if (!from) { viewFromInput.classList.add('error'); return; }
    if (!to)   { viewToInput.classList.add('error');   return; }
    viewFromInput.classList.remove('error');
    viewToInput.classList.remove('error');

    viewFetchBtn.disabled = true;
    viewFetchBtn.textContent = 'Loading…';

    const { ok, data } = await api('GET', `/api/rates/history?from=${from}&to=${to}`);
    viewFetchBtn.disabled = false;
    viewFetchBtn.innerHTML = '&#128269; Fetch History';

    if (!ok) { showToast('Failed to load rate history', 'error'); return; }

    historyResult.style.display = 'none';
    historyEmpty.style.display  = 'none';

    if (!data.dates || data.dates.length === 0) {
      historyEmpty.style.display = '';
      return;
    }

    historyResult.style.display = '';
    historyResult.innerHTML = data.dates.map(d => {
      const items   = data.detail[d.date] || [];
      const dateStr = formatDisplayDate(d.date);
      const rows    = items.map((r, i) => `
        <tr>
          <td style="text-align:center;color:var(--text-muted)">${i + 1}</td>
          <td><strong>${escapeHtml(r.commodity_name)}</strong> <span style="font-size:11px;color:var(--text-muted)">${escapeHtml(r.short_name)}</span></td>
          <td>${escapeHtml(r.unit)}</td>
          <td style="text-align:right;font-weight:600">₹${Number(r.rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>`).join('');

      return `
        <div class="card">
          <div class="card-header">
            <div>
              <h3 style="font-size:15px">${dateStr}</h3>
              <span style="font-size:12px;color:var(--text-muted)">${d.commodity_count} commodity rate${d.commodity_count !== 1 ? 's' : ''} saved</span>
            </div>
            <button class="btn btn-primary btn-sm rate-edit-date-btn" data-date="${d.date}">✏️ Edit Rates</button>
          </div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width:32px">#</th>
                  <th>Commodity</th>
                  <th style="width:80px">Unit</th>
                  <th style="text-align:right;width:130px">Rate (₹)</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    }).join('');

    // Wire up Edit buttons — switch to entry tab and pre-fill date
    historyResult.querySelectorAll('.rate-edit-date-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        dateInput.value = btn.dataset.date;
        switchTab('entry');
        fetchBtn.click();
      });
    });
  });
}

// Reset Rate Entry page state (called on navigation/context switch)
function loadRatesPage() {
  const today = todayISO();
  const dateInput  = document.getElementById('rate-date');
  const entryCard  = document.getElementById('rate-entry-card');
  const tbody      = document.getElementById('rate-tbody');
  const noData     = document.getElementById('rate-no-data');
  const tableWrap  = document.getElementById('rate-table-wrap');
  const historyResult = document.getElementById('rate-history-result');
  const historyEmpty  = document.getElementById('rate-history-empty');
  const viewFrom   = document.getElementById('rate-view-from');
  const viewTo     = document.getElementById('rate-view-to');

  if (dateInput) dateInput.value = today;
  if (entryCard) entryCard.style.display = 'none';
  if (tbody) tbody.innerHTML = '';
  if (noData) noData.style.display = 'none';
  if (tableWrap) tableWrap.style.display = 'none';
  if (historyResult) { historyResult.style.display = 'none'; historyResult.innerHTML = ''; }
  if (historyEmpty) historyEmpty.style.display = 'none';
  if (viewFrom) viewFrom.value = offsetDate(today, -7);
  if (viewTo) viewTo.value = today;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function offsetDate(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
