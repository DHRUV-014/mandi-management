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
  ['rpt-gp-from','rpt-gp-to','rpt-cm-from','rpt-cm-to','rpt-ar-from','rpt-ar-to','rpt-cash-from','rpt-cash-to']
    .forEach(id => { document.getElementById(id).value = today; });

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

    // Flatten all items, carrying gate pass info into each row
    const allItems = data.passes.flatMap(p => p.items.map(it => ({
      ...it,
      gate_pass_number: p.gate_pass_number,
      gp_date: p.created_at,
      vehicle_number: p.vehicle_number || '—',
    })));
    document.getElementById('rpt-gp-count').textContent = `${allItems.length} item${allItems.length !== 1 ? 's' : ''}`;

    const tbody = document.getElementById('rpt-gp-tbody');
    if (allItems.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No gate passes found in this date range</td></tr>';
      return;
    }

    tbody.innerHTML = allItems.map((it, i) => {
      const tw = it.total_weight || 0;
      return `<tr>
        <td style="text-align:center;color:var(--text-muted)">${i + 1}</td>
        <td>${rptFormatDate(it.gp_date)}</td>
        <td>${rptFormatTime(it.gp_date)}</td>
        <td><span class="gp-number-badge">#${it.gate_pass_number}</span></td>
        <td>${escapeHtml(it.shop_number)}</td>
        <td>${escapeHtml(it.commodity_name)}</td>
        <td style="text-align:center"><strong>${it.number_of_bags}</strong></td>
        <td style="text-align:center">${it.weight_per_bag > 0 ? it.weight_per_bag : '—'}</td>
        <td>${escapeHtml(it.vehicle_number)}</td>
      </tr>`;
    }).join('');
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
}
