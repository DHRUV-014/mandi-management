/* ============================================================
   MANDI — Reports (Gate Pass, Commodity, Arrival, Cash)
   ============================================================ */

function rptFormatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return dateStr;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function rptFormatTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function rptFmtNum(n) {
  if (n == null) return '—';
  return n % 1 === 0 ? n.toLocaleString('en-IN') : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rptValidateDates(fromId, toId) {
  const from = document.getElementById(fromId).value;
  const to   = document.getElementById(toId).value;
  document.getElementById(fromId).classList.remove('error');
  document.getElementById(toId).classList.remove('error');
  if (!from) { document.getElementById(fromId).classList.add('error'); showToast('Please select From Date', 'error'); return null; }
  if (!to)   { document.getElementById(toId).classList.add('error');   showToast('Please select To Date', 'error');   return null; }
  if (from > to) { showToast('From Date cannot be after To Date', 'error'); return null; }
  return { from, to };
}

function rptRenderSummary(el, items) {
  el.classList.remove('hidden');
  el.innerHTML = items.map(s => `
    <div class="report-stat">
      <div class="report-stat-value">${s.value}</div>
      <div class="report-stat-label">${s.label}</div>
    </div>
  `).join('');
}

function rptPrintTable(title, subtitle, tableEl) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm 10mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 10px; }
    h1 { font-size: 15px; color: #1a6b3a; margin-bottom: 1px; }
    .sub { font-size: 10px; color: #666; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1a6b3a; color: #fff; padding: 5px 6px; text-align: left; font-size: 10px; text-transform: uppercase; }
    td { padding: 3px 6px; border-bottom: 1px solid #e0e0e0; font-size: 10.5px; }
    tbody tr:nth-child(even) td { background: #f7f7f7; }
    .rpt-total-row td { border-top: 1.5px solid #1a6b3a; font-weight: 700; background: #f0f7f2; }
    .text-muted { color: #777; }
    .footer { text-align: center; font-size: 9px; color: #999; margin-top: 10px; border-top: 1px solid #eee; padding-top: 6px; }
  </style></head><body>
    <h1>${title}</h1>
    <div class="sub">${subtitle}</div>
    ${tableEl.outerHTML}
    <div class="footer">Generated from Mandi Management System &middot; ${new Date().toLocaleDateString('en-IN')}</div>
  </body></html>`;
  openPrintWindow(html, true);
}

function initReportsModule() {
  // Set all date inputs to today by default
  const today = todayISO();
  ['rpt-gp-from','rpt-gp-to','rpt-cm-from','rpt-cm-to','rpt-ar-from','rpt-ar-to','rpt-cash-from','rpt-cash-to','rpt-sw-from','rpt-sw-to','rpt-ld-from','rpt-ld-to']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = today; });

  // ── Gate Pass Wise Report ───────────────────────────────
  document.getElementById('rpt-gp-fetch').addEventListener('click', async () => {
    const range = rptValidateDates('rpt-gp-from', 'rpt-gp-to');
    if (!range) return;

    const btn = document.getElementById('rpt-gp-fetch');
    btn.disabled = true; btn.textContent = 'Loading…';

    const { ok, data } = await api('GET', `/api/reports/gate-pass?from=${range.from}&to=${range.to}`);
    btn.disabled = false; btn.innerHTML = '&#128269; Fetch Report';

    if (!ok) { showToast('Failed to load report', 'error'); return; }

    const result = document.getElementById('rpt-gp-result');
    result.style.display = '';

    const tbody = document.getElementById('rpt-gp-tbody');

    if (!data.items || data.items.length === 0) {
      document.getElementById('rpt-gp-count').textContent = '0 items';
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No gate passes found in this date range</td></tr>';
      return;
    }

    document.getElementById('rpt-gp-count').textContent =
      `${data.items.length} item${data.items.length !== 1 ? 's' : ''}`;

    tbody.innerHTML = data.items.map(it => `<tr>
      <td>${rptFormatDate(it.date)}</td>
      <td><span class="gp-number-badge">#${it.gate_pass_number}</span></td>
      <td>${escapeHtml(it.commodity_name)}</td>
      <td style="text-align:center"><strong>${it.number_of_bags}</strong></td>
      <td style="text-align:center">${it.weight_per_bag > 0 ? it.weight_per_bag : '—'}</td>
      <td>${escapeHtml(it.vehicle_number || '—')}</td>
    </tr>`).join('');
  });

  document.getElementById('rpt-gp-print').addEventListener('click', () => {
    const from = document.getElementById('rpt-gp-from').value;
    const to   = document.getElementById('rpt-gp-to').value;
    const table = document.getElementById('rpt-gp-table');
    rptPrintTable('Gate Pass Wise Report', `Period: ${rptFormatDate(from)} to ${rptFormatDate(to)}`, table);
  });

  // ── Commodity Wise Report ───────────────────────────────
  document.getElementById('rpt-cm-fetch').addEventListener('click', async () => {
    const range = rptValidateDates('rpt-cm-from', 'rpt-cm-to');
    if (!range) return;

    const btn = document.getElementById('rpt-cm-fetch');
    btn.disabled = true; btn.textContent = 'Loading…';

    const { ok, data } = await api('GET', `/api/reports/commodity?from=${range.from}&to=${range.to}`);
    btn.disabled = false; btn.innerHTML = '&#128269; Fetch Report';

    if (!ok) { showToast('Failed to load report', 'error'); return; }

    rptRenderSummary(document.getElementById('rpt-cm-summary'), [
      { value: data.summary.total_commodities, label: 'Commodities' },
      { value: rptFmtNum(data.summary.total_bags), label: 'Total Qty' },
      { value: rptFmtNum(data.summary.total_weight), label: 'Total Weight (kg)' },
    ]);

    const result = document.getElementById('rpt-cm-result');
    result.style.display = '';
    document.getElementById('rpt-cm-count').textContent = `${data.commodities.length} record${data.commodities.length !== 1 ? 's' : ''}`;

    const tbody = document.getElementById('rpt-cm-tbody');
    if (data.commodities.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No data found in this date range</td></tr>';
      return;
    }

    tbody.innerHTML = data.commodities.map((c, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(c.commodity_name)}</strong></td>
        <td><span class="ac-short-badge">${escapeHtml(c.short_name)}</span></td>
        <td style="text-align:center">${escapeHtml(c.unit)}</td>
        <td style="text-align:center">${c.gate_pass_count}</td>
        <td style="text-align:center">${c.trader_count}</td>
        <td style="text-align:center"><strong>${rptFmtNum(c.total_bags)}</strong></td>
        <td style="text-align:center"><strong>${rptFmtNum(c.total_weight)}</strong></td>
      </tr>
    `).join('') + `
      <tr class="rpt-total-row">
        <td colspan="6" style="text-align:right">Grand Total</td>
        <td style="text-align:center">${rptFmtNum(data.summary.total_bags)}</td>
        <td style="text-align:center">${rptFmtNum(data.summary.total_weight)}</td>
      </tr>`;
  });

  document.getElementById('rpt-cm-print').addEventListener('click', () => {
    const from = document.getElementById('rpt-cm-from').value;
    const to   = document.getElementById('rpt-cm-to').value;
    const table = document.querySelector('#rpt-cm-result .data-table');
    rptPrintTable('Commodity Wise Report', `Period: ${rptFormatDate(from)} to ${rptFormatDate(to)}`, table);
  });

  // ── Commodity State Wise Report ─────────────────────────
  document.getElementById('rpt-ar-fetch').addEventListener('click', async () => {
    const range = rptValidateDates('rpt-ar-from', 'rpt-ar-to');
    if (!range) return;

    const btn = document.getElementById('rpt-ar-fetch');
    btn.disabled = true; btn.textContent = 'Loading…';

    const { ok, data } = await api('GET', `/api/reports/total-arrival?from=${range.from}&to=${range.to}`);
    btn.disabled = false; btn.innerHTML = '&#128269; Fetch Report';

    if (!ok) { showToast('Failed to load report', 'error'); return; }

    const result = document.getElementById('rpt-ar-result');
    result.style.display = '';

    const tbody = document.getElementById('rpt-ar-tbody');

    if (!data.commodities || data.commodities.length === 0) {
      document.getElementById('rpt-ar-count').textContent = '0 commodities';
      tbody.innerHTML = '<tr class="empty-row"><td colspan="3">No arrivals found in this date range</td></tr>';
      return;
    }

    document.getElementById('rpt-ar-count').textContent =
      `${data.commodities.length} commodit${data.commodities.length !== 1 ? 'ies' : 'y'}`;

    let html = '';
    data.commodities.forEach(c => {
      // Commodity header row
      html += `<tr class="csw-commodity-row">
        <td colspan="3"><strong>${escapeHtml(c.commodity_name)}</strong>${c.short_name ? ` <span style="color:var(--text-muted);font-size:11px">(${escapeHtml(c.short_name)})</span>` : ''}</td>
      </tr>`;

      // One row per state
      c.states.forEach(s => {
        html += `<tr class="csw-state-row">
          <td style="padding-left:40px">${escapeHtml(s.state_name)}</td>
          <td style="text-align:right"><strong>${rptFmtNum(s.total_weight)}</strong></td>
          <td>${escapeHtml(s.unit || '')}</td>
        </tr>`;
      });

      // Total row per commodity
      html += `<tr class="csw-total-row">
        <td style="padding-left:40px;font-weight:600">Total Qty</td>
        <td style="text-align:right;font-weight:700">${rptFmtNum(c.grand_total)}</td>
        <td></td>
      </tr>`;
    });

    tbody.innerHTML = html;
  });

  document.getElementById('rpt-ar-print').addEventListener('click', () => {
    const from = document.getElementById('rpt-ar-from').value;
    const to   = document.getElementById('rpt-ar-to').value;
    const table = document.getElementById('rpt-ar-table');
    rptPrintTable('Commodity State Wise Report', `Period: ${rptFormatDate(from)} to ${rptFormatDate(to)}`, table);
  });

  // ── Cash Report ─────────────────────────────────────────
  document.getElementById('rpt-cash-fetch').addEventListener('click', async () => {
    const range = rptValidateDates('rpt-cash-from', 'rpt-cash-to');
    if (!range) return;

    const btn = document.getElementById('rpt-cash-fetch');
    btn.disabled = true; btn.textContent = 'Loading…';

    const { ok, data } = await api('GET', `/api/reports/cash?from=${range.from}&to=${range.to}`);
    btn.disabled = false; btn.innerHTML = '&#128269; Fetch Report';

    if (!ok) { showToast('Failed to load report', 'error'); return; }

    rptRenderSummary(document.getElementById('rpt-cash-summary'), [
      { value: data.summary.type_count, label: 'Vehicle Types' },
      { value: rptFmtNum(data.summary.total_vehicles), label: 'Total Vehicles' },
      { value: '₹' + rptFmtNum(data.summary.total_charges), label: 'Total Collection' },
    ]);

    const result = document.getElementById('rpt-cash-result');
    result.style.display = '';
    document.getElementById('rpt-cash-count').textContent = `${data.types.length} type${data.types.length !== 1 ? 's' : ''}`;

    const tbody = document.getElementById('rpt-cash-tbody');
    if (data.types.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No vehicle charges found in this date range</td></tr>';
      return;
    }

    tbody.innerHTML = data.types.map((t, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(t.vehicle_type)}</strong></td>
        <td style="text-align:center"><strong>${t.count}</strong></td>
        <td style="text-align:right">₹${rptFmtNum(t.rate)}</td>
        <td style="text-align:right"><strong>₹${rptFmtNum(t.total_charges)}</strong></td>
      </tr>
    `).join('') + `
      <tr class="rpt-total-row">
        <td colspan="2" style="text-align:right">Grand Total</td>
        <td style="text-align:center"><strong>${rptFmtNum(data.summary.total_vehicles)}</strong></td>
        <td></td>
        <td style="text-align:right"><strong>₹${rptFmtNum(data.summary.total_charges)}</strong></td>
      </tr>`;
  });

  document.getElementById('rpt-cash-print').addEventListener('click', () => {
    const from = document.getElementById('rpt-cash-from').value;
    const to   = document.getElementById('rpt-cash-to').value;
    const table = document.getElementById('rpt-cash-table');
    rptPrintTable('Cash Report — Vehicle Charges', `Period: ${rptFormatDate(from)} to ${rptFormatDate(to)}`, table);
  });

  // ── Shop Wise Report ─────────────────────────────────────
  ['rpt-sw-from','rpt-sw-to','rpt-sw-shop'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('rpt-sw-fetch').click();
    });
  });

  document.getElementById('rpt-sw-fetch').addEventListener('click', async () => {
    const range = rptValidateDates('rpt-sw-from', 'rpt-sw-to');
    if (!range) return;

    const btn = document.getElementById('rpt-sw-fetch');
    btn.disabled = true; btn.textContent = 'Loading…';

    const shopFilter = document.getElementById('rpt-sw-shop').value.trim().toUpperCase();
    let url = `/api/reports/shop-gate-pass?from=${range.from}&to=${range.to}`;
    if (shopFilter) url += `&shop=${encodeURIComponent(shopFilter)}`;

    const { ok, data } = await api('GET', url);
    btn.disabled = false; btn.innerHTML = '&#128269; Check';

    if (!ok) { showToast('Failed to load report', 'error'); return; }

    const result = document.getElementById('rpt-sw-result');
    result.style.display = '';

    const tbody = document.getElementById('rpt-sw-tbody');

    if (!data.shops || data.shops.length === 0) {
      document.getElementById('rpt-sw-count').textContent = '0 shops';
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No data found for this date range</td></tr>';
      return;
    }

    document.getElementById('rpt-sw-count').textContent =
      `${data.shops.length} shop${data.shops.length !== 1 ? 's' : ''}`;

    let html = '';
    data.shops.forEach((shop, idx) => {
      // Separator between shops (not before first)
      if (idx > 0) {
        html += `<tr><td colspan="6" style="padding:0;border-top:3px solid #1a6b3a"></td></tr>`;
      }

      html += `<tr class="csw-commodity-row">
        <td colspan="6">
          <strong>${escapeHtml(shop.shop_number)}</strong>
          <span style="color:var(--text-muted);font-size:12px;margin-left:8px">${escapeHtml(shop.trader_name)}</span>
        </td>
      </tr>`;

      shop.entries.forEach(e => {
        html += `<tr>
          <td>${rptFormatDate(e.date)}</td>
          <td><span class="gp-number-badge">#${e.gate_pass_number}</span></td>
          <td>${escapeHtml(e.commodity_name)}</td>
          <td style="text-align:center"><strong>${e.number_of_bags}</strong></td>
          <td style="text-align:center">${e.weight_per_bag > 0 ? e.weight_per_bag : '—'}</td>
          <td>${escapeHtml(e.vehicle_number)}</td>
        </tr>`;
      });
    });

    tbody.innerHTML = html;
  });

  // ── Ledger Report (admin only) ──────────────────────────

  async function ldLoadTraders() {
    const from = document.getElementById('rpt-ld-from').value || today;
    const to   = document.getElementById('rpt-ld-to').value   || today;
    const { ok, data } = await api('GET', `/api/reports/ledger?from=${from}&to=${to}`);
    if (!ok) return;
    const sel = document.getElementById('rpt-ld-trader');
    const cur = sel.value;
    sel.innerHTML = '<option value="">— All Traders —</option>' +
      data.traders.map(t =>
        `<option value="${t.id}" ${String(t.id) === cur ? 'selected' : ''}>${escapeHtml(t.shop_number)} — ${escapeHtml(t.trader_name)}</option>`
      ).join('');
  }

  document.getElementById('rpt-ld-from').addEventListener('change', ldLoadTraders);
  document.getElementById('rpt-ld-to').addEventListener('change',   ldLoadTraders);
  ['rpt-ld-from','rpt-ld-to'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('rpt-ld-fetch').click();
    });
  });

  document.getElementById('rpt-ld-fetch').addEventListener('click', async () => {
    const range = rptValidateDates('rpt-ld-from', 'rpt-ld-to');
    if (!range) return;

    const traderId = document.getElementById('rpt-ld-trader').value;
    let url = `/api/reports/ledger?from=${range.from}&to=${range.to}`;
    if (traderId) url += `&trader_id=${traderId}`;

    const btn = document.getElementById('rpt-ld-fetch');
    btn.disabled = true; btn.textContent = 'Loading…';

    const { ok, data } = await api('GET', url);
    btn.disabled = false; btn.innerHTML = '&#128269; Generate Ledger';

    if (!ok) { showToast('Failed to load ledger', 'error'); return; }

    // Update trader dropdown
    const sel = document.getElementById('rpt-ld-trader');
    sel.innerHTML = '<option value="">— All Traders —</option>' +
      data.traders.map(t =>
        `<option value="${t.id}" ${String(t.id) === traderId ? 'selected' : ''}>${escapeHtml(t.shop_number)} — ${escapeHtml(t.trader_name)}</option>`
      ).join('');

    const container = document.getElementById('rpt-ld-result');

    if (!data.ledger || data.ledger.length === 0) {
      container.innerHTML = `<div class="card"><p style="padding:24px;color:var(--text-muted);text-align:center;font-style:italic">No data found for this period.</p></div>`;
      return;
    }

    // Compute grand totals across all traders
    let grandFee = 0, grandHasFee = false;
    data.ledger.forEach(t => {
      grandFee = Math.round((grandFee + (t.grand_fee || 0)) * 100) / 100;
      if (t.grand_fee) grandHasFee = true;
    });

    // Trader detail cards
    const traderCards = data.ledger.map(trader => {
      const dateRows = trader.dates.map(day => {
        const itemRows = day.items.map(item => `
          <tr>
            <td>${rptFormatDate(item._date || day.date)}</td>
            <td><span class="gp-number-badge" style="font-size:11px">#${item.gate_pass_number}</span></td>
            <td>${escapeHtml(item.vehicle_number)}</td>
            <td>${escapeHtml(item.commodity_name)}</td>
            <td style="text-align:center">${item.number_of_bags}</td>
            <td style="text-align:center">${item.weight_per_bag > 0 ? item.weight_per_bag : '—'}</td>
            <td style="text-align:right;font-weight:600">${item.value != null ? '₹' + rptFmtNum(item.value) : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td style="text-align:right;color:var(--primary);font-weight:600">${item.fee != null ? '₹' + rptFmtNum(item.fee) : '<span style="color:var(--text-muted)">—</span>'}</td>
          </tr>`).join('');

        return itemRows;
      }).join('');

      return `
        <div class="card" style="margin-bottom:24px">
          <div class="card-header">
            <div>
              <h3 style="font-size:16px">${escapeHtml(trader.trader_name)}</h3>
              <span style="font-size:12px;color:var(--text-muted)">Shop No: <strong>${escapeHtml(trader.shop_number)}</strong></span>
            </div>
            <button class="btn btn-ghost btn-sm rpt-ld-print-one" data-shop="${escapeHtml(trader.shop_number)}">&#128424; Print</button>
          </div>
          <div class="table-wrapper">
            <table class="data-table ledger-table" id="ledger-${trader.trader_id}">
              <thead>
                <tr>
                  <th style="width:90px">Date</th>
                  <th style="width:100px">Gate Pass</th>
                  <th style="width:100px">Vehicle No</th>
                  <th>Commodity</th>
                  <th style="text-align:center;width:55px">Qty</th>
                  <th style="text-align:center;width:55px">Unit</th>
                  <th style="text-align:right;width:110px">Value (₹)</th>
                  <th style="text-align:right;width:110px">Fee 1% (₹)</th>
                </tr>
              </thead>
              <tbody>${dateRows}</tbody>
              <tfoot>
                <tr class="rpt-total-row">
                  <td colspan="6" style="text-align:right;font-size:13px">Trader Total Fee</td>
                  <td></td>
                  <td style="text-align:right"><strong>${trader.grand_fee ? '₹' + rptFmtNum(trader.grand_fee) : '—'}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>`;
    }).join('');

    // Summary table (all traders in one place)
    const summaryRows = data.ledger.map(t => `
      <tr>
        <td><strong>${escapeHtml(t.shop_number)}</strong></td>
        <td>${escapeHtml(t.trader_name)}</td>
        <td style="text-align:right">${t.grand_value ? '₹' + rptFmtNum(t.grand_value) : '—'}</td>
        <td style="text-align:right"><strong>${t.grand_fee ? '₹' + rptFmtNum(t.grand_fee) : '—'}</strong></td>
      </tr>`).join('');

    const summaryCard = `
      <div class="card" id="rpt-ld-summary-card" style="margin-bottom:24px;border:2px solid var(--primary)">
        <div class="card-header">
          <h3 style="font-size:16px;color:var(--primary)">Summary — All Traders</h3>
          <button class="btn btn-ghost btn-sm" id="rpt-ld-print-summary">&#128424; Print Summary</button>
        </div>
        <div class="table-wrapper">
          <table class="data-table" id="rpt-ld-summary-table">
            <thead>
              <tr>
                <th style="width:90px">Shop No</th>
                <th>Trader Name</th>
                <th style="text-align:right;width:140px">Total Value (₹)</th>
                <th style="text-align:right;width:140px">Total Fee 1% (₹)</th>
              </tr>
            </thead>
            <tbody>${summaryRows}</tbody>
            <tfoot>
              <tr class="rpt-total-row">
                <td colspan="3" style="text-align:right;font-size:13px">Grand Total Fee</td>
                <td style="text-align:right"><strong>${grandHasFee ? '₹' + rptFmtNum(grandFee) : '—'}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;

    // Top action bar with View Summary button
    const topBar = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
        <button class="btn btn-primary btn-sm" id="rpt-ld-jump-summary">&#128203; View Summary</button>
      </div>`;

    container.innerHTML = topBar + traderCards + summaryCard;

    // Jump to summary
    document.getElementById('rpt-ld-jump-summary').addEventListener('click', () => {
      document.getElementById('rpt-ld-summary-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Print summary
    document.getElementById('rpt-ld-print-summary').addEventListener('click', () => {
      const from = document.getElementById('rpt-ld-from').value;
      const to   = document.getElementById('rpt-ld-to').value;
      rptPrintTable('Ledger Summary — All Traders', `Period: ${rptFormatDate(from)} to ${rptFormatDate(to)}`, document.getElementById('rpt-ld-summary-table'));
    });

    // Print individual trader
    container.querySelectorAll('.rpt-ld-print-one').forEach(btn => {
      btn.addEventListener('click', () => {
        const shop  = btn.dataset.shop;
        const table = btn.closest('.card').querySelector('.ledger-table');
        const from  = document.getElementById('rpt-ld-from').value;
        const to    = document.getElementById('rpt-ld-to').value;
        rptPrintTable(`Ledger — Shop ${shop}`, `Period: ${rptFormatDate(from)} to ${rptFormatDate(to)}`, table);
      });
    });
  });

  document.getElementById('rpt-sw-print').addEventListener('click', () => {
    const from = document.getElementById('rpt-sw-from').value;
    const to   = document.getElementById('rpt-sw-to').value;
    const table = document.getElementById('rpt-sw-table');
    rptPrintTable('Shop Wise Report', `Period: ${rptFormatDate(from)} to ${rptFormatDate(to)}`, table);
  });
}
