/* ============================================================
   MANDI — Daily Rate Entry
   ============================================================ */

function initRatesModule() {
  const dateInput      = document.getElementById('rate-date');
  const fetchBtn       = document.getElementById('rate-fetch-btn');
  const entryCard      = document.getElementById('rate-entry-card');
  const entryTitle     = document.getElementById('rate-entry-title');
  const countBadge     = document.getElementById('rate-commodity-count');
  const noData         = document.getElementById('rate-no-data');
  const tableWrap      = document.getElementById('rate-table-wrap');
  const tbody          = document.getElementById('rate-tbody');
  const saveBtn        = document.getElementById('rate-save-btn');

  // Default to today
  dateInput.value = todayISO();

  // ── Fetch commodities for selected date ──────────────────
  fetchBtn.addEventListener('click', async () => {
    const date = dateInput.value;
    if (!date) { dateInput.classList.add('error'); return; }
    dateInput.classList.remove('error');

    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Loading…';

    const { ok, data } = await api('GET', `/api/rates/by-date?date=${date}`);
    fetchBtn.disabled = false;
    fetchBtn.innerHTML = '&#128269; Fetch Commodities';

    if (!ok) { showToast('Failed to fetch data', 'error'); return; }

    entryCard.style.display = '';
    entryTitle.textContent  = `Rates for ${formatDisplayDate(date)}`;

    if (data.commodities.length === 0) {
      countBadge.textContent = '0 commodities';
      noData.style.display   = '';
      tableWrap.style.display = 'none';
      return;
    }

    noData.style.display    = 'none';
    tableWrap.style.display = '';
    countBadge.textContent  = `${data.commodities.length} commodit${data.commodities.length !== 1 ? 'ies' : 'y'}`;

    tbody.innerHTML = data.commodities.map((c, i) => {
      const existing = data.rates[c.id] !== undefined ? data.rates[c.id] : '';
      const saved    = data.rates[c.id] !== undefined;
      return `<tr data-id="${c.id}">
        <td style="text-align:center;color:var(--text-muted)">${i + 1}</td>
        <td>
          <strong>${escapeHtml(c.commodity_name)}</strong>
          <span style="font-size:11px;color:var(--text-muted);margin-left:6px">${escapeHtml(c.short_name)}</span>
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

    // Enter key moves to next row
    tbody.querySelectorAll('.rate-input').forEach((input, idx, all) => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (idx < all.length - 1) all[idx + 1].focus();
          else saveBtn.focus();
        }
      });
    });
  });

  // ── Save rates ───────────────────────────────────────────
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

    showToast('Rates saved successfully', 'success');

    // Update status badges
    rows.forEach(row => {
      const id    = row.dataset.id;
      const badge = row.querySelector('.rate-status-badge');
      if (rates[id] !== undefined) {
        badge.className = 'rate-status-badge rate-saved';
        badge.innerHTML = '&#10003; Saved';
      }
    });
  });
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}
