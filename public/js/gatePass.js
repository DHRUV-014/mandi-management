/* ============================================================
   MANDI — Gate Pass Entry (autocomplete, save, view, print/PDF)
   ============================================================ */

const gpState = {
  traders: [],
  commodities: [],
  vehicleTypes: [],
  stateCodes: [],
  rowSeq: 0,
};

// ── Generic autocomplete used by line item rows ───────────
function createAutocomplete(wrap, items, { filterFn, displayFn, renderItemHTML, autoPickFn, autoPickSingle }) {
  const input    = wrap.querySelector('.ac-input');
  const hidden   = wrap.querySelector('.ac-value');
  const dropdown = wrap.querySelector('.ac-dropdown');
  let current = [];
  let focusIdx = -1;

  function show(filtered) {
    current  = filtered;
    focusIdx = -1;
    dropdown.innerHTML = filtered.length
      ? filtered.map((it, i) => `<div class="ac-item" data-i="${i}">${renderItemHTML(it)}</div>`).join('')
      : '<div class="ac-empty">No matches found</div>';
    dropdown.querySelectorAll('.ac-item').forEach(el => {
      el.addEventListener('mousedown', e => { e.preventDefault(); pick(current[+el.dataset.i]); });
    });
    dropdown.classList.remove('hidden');
  }

  function pick(item) {
    hidden.value  = item.id;
    input.value   = displayFn(item);
    input.classList.remove('error');
    dropdown.classList.add('hidden');
    input.dispatchEvent(new CustomEvent('ac-selected', { bubbles: true }));
  }

  function open() {
    const q = input.value.trim().toLowerCase();
    show(q ? items.filter(it => filterFn(it, q)) : items.slice(0, 60));
  }

  input.addEventListener('focus',  open);
  input.addEventListener('input', () => {
    hidden.value = '';
    const q = input.value.trim().toLowerCase();
    if (autoPickFn && q) {
      const exact = items.find(it => autoPickFn(it, q));
      if (exact) { pick(exact); return; }
    }
    if (autoPickSingle && q.length >= 2) {
      const filtered = items.filter(it => filterFn(it, q));
      if (filtered.length === 1) { pick(filtered[0]); return; }
      show(filtered);
      return;
    }
    open();
  });
  input.addEventListener('blur',  () => {
    setTimeout(() => {
      dropdown.classList.add('hidden');
      if (!hidden.value) input.value = '';
    }, 160);
  });
  input.addEventListener('keydown', e => {
    const els = [...dropdown.querySelectorAll('.ac-item')];
    if (!els.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusIdx = Math.min(focusIdx + 1, els.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusIdx = Math.max(focusIdx - 1, 0);
    } else if ((e.key === 'Enter' || e.key === 'Tab') && focusIdx >= 0) {
      e.preventDefault();
      pick(current[focusIdx]);
      return;
    } else if (e.key === 'Escape') {
      dropdown.classList.add('hidden'); return;
    }
    els.forEach((el, i) => el.classList.toggle('focused', i === focusIdx));
    els[focusIdx]?.scrollIntoView({ block: 'nearest' });
  });

  return {
    getValue:   () => hidden.value,
    reset:      () => { input.value = ''; hidden.value = ''; dropdown.classList.add('hidden'); },
    setValue:   (item) => { hidden.value = item.id; input.value = displayFn(item); input.classList.remove('error'); dropdown.classList.add('hidden'); },
    setError:   () => input.classList.add('error'),
    clearError: () => input.classList.remove('error'),
  };
}

// ── Load / reset the Gate Pass page ───────────────────────
async function loadGatePassPage() {
  const [tradersRes, commoditiesRes, nextRes, vehicleRes, statesRes] = await Promise.all([
    api('GET', '/api/traders'),
    api('GET', '/api/commodities'),
    api('GET', '/api/gate-pass/next-number'),
    api('GET', '/api/vehicle-types'),
    api('GET', '/api/states/all'),
  ]);

  if (!tradersRes.ok || !commoditiesRes.ok || !nextRes.ok) {
    showToast('Failed to load gate pass data', 'error');
    return;
  }

  gpState.traders      = tradersRes.data;
  gpState.commodities  = commoditiesRes.data;
  gpState.vehicleTypes = vehicleRes.ok ? vehicleRes.data : [];
  gpState.stateCodes   = statesRes.ok  ? statesRes.data  : [];

  document.getElementById('gp-number').value = nextRes.data.next;
  document.getElementById('gp-date').value = todayISO();
  document.getElementById('gp-time').value = nowHM();

  document.getElementById('gp-vehicle-number').value = '';
  const stateDisp = document.getElementById('gp-state-display');
  stateDisp.value = '';
  stateDisp.classList.remove('state-unknown');
  delete stateDisp.dataset.code;
  delete stateDisp.dataset.name;

  const vtSelect = document.getElementById('gp-vehicle-type');
  vtSelect.innerHTML = '<option value="">-- Select Vehicle --</option>' +
    gpState.vehicleTypes.map(v => `<option value="${v.id}" data-charges="${v.charges}">${escapeHtml(v.name)} (₹${Number(v.charges).toLocaleString('en-IN')})</option>`).join('');
  vtSelect.value = '';
  document.getElementById('gp-vehicle-charges').classList.add('hidden');

  const tbody = document.getElementById('gp-items-tbody');
  tbody.innerHTML = '';
  gpState.rowSeq = 0;
  gpAddRow();

  loadGatePassList();
}

function todayISO() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowHM() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function gpUpdateStateFromVehicle() {
  const veh = document.getElementById('gp-vehicle-number').value;
  const stateDisp = document.getElementById('gp-state-display');
  const prefix = veh.slice(0, 2);

  if (prefix.length < 2) {
    stateDisp.value = '';
    stateDisp.classList.remove('state-unknown');
    delete stateDisp.dataset.code;
    delete stateDisp.dataset.name;
    return;
  }

  const match = gpState.stateCodes.find(s => s.state_code.toUpperCase() === prefix);
  if (match) {
    stateDisp.value = `${match.state_code} — ${match.state_name}`;
    stateDisp.classList.remove('state-unknown');
    stateDisp.dataset.code = match.state_code;
    stateDisp.dataset.name = match.state_name;
  } else {
    stateDisp.value = `${prefix} — Unknown`;
    stateDisp.classList.add('state-unknown');
    stateDisp.dataset.code = prefix;
    stateDisp.dataset.name = 'Unknown';
  }
}

// ── Line item row builder ─────────────────────────────────
function gpAddRow() {
  gpState.rowSeq++;
  const tbody = document.getElementById('gp-items-tbody');

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="ac-cell">
      <div class="ac-wrap">
        <input class="ac-input" type="text" placeholder="Type trader / shop…" autocomplete="off" spellcheck="false" />
        <input class="ac-value gp-trader-id" type="hidden" />
        <div class="ac-dropdown hidden"></div>
      </div>
    </td>
    <td class="ac-cell">
      <div class="ac-wrap">
        <input class="ac-input" type="text" placeholder="Short name / name…" autocomplete="off" spellcheck="false" />
        <input class="ac-value gp-commodity-id" type="hidden" />
        <div class="ac-dropdown hidden"></div>
      </div>
    </td>
    <td>
      <select class="gp-unit">
        <option value="">-- Unit --</option>
        <option value="Quintal">Quintal</option>
        <option value="Kg">Kg</option>
        <option value="Ton">Ton</option>
        <option value="Bag">Bag</option>
        <option value="Piece">Piece</option>
        <option value="Litre">Litre</option>
        <option value="Box">Box</option>
        <option value="KGS">KGS</option>
        <option value="CAGES">CAGES</option>
        <option value="BAGS">BAGS</option>
      </select>
    </td>
    <td>
      <input type="number" class="gp-bags" min="1" step="1" placeholder="0" />
    </td>
    <td>
      <input type="number" class="gp-weight" min="0" step="0.01" placeholder="0.00" />
    </td>
    <td>
      <span class="gp-total-weight">—</span>
    </td>
    <td>
      <button type="button" class="btn btn-icon delete gp-remove-btn" title="Remove row">&#10005;</button>
    </td>
  `;

  const traderWrap = tr.querySelector('td:nth-child(1) .ac-wrap');
  const traderAcInput = traderWrap.querySelector('.ac-input');

  traderAcInput.addEventListener('focus', () => {
    const vtSelect = document.getElementById('gp-vehicle-type');
    if (!vtSelect.value) {
      vtSelect.classList.add('error');
      setTimeout(() => vtSelect.focus(), 50);
    }
  });

  createAutocomplete(traderWrap, gpState.traders, {
    filterFn:       (t, q) => t.trader_name.toLowerCase().includes(q) || t.shop_number.toLowerCase().includes(q),
    displayFn:      (t) => `${t.trader_name} (${t.shop_number})`,
    renderItemHTML: (t) => `
      <span class="ac-main">${escapeHtml(t.trader_name)}</span>
      <span class="ac-sub">${escapeHtml(t.shop_number)}</span>
      ${t.status === 'banned'
        ? '<span class="ac-banned-badge">BANNED</span>'
        : '<span class="ac-active-badge">ACTIVE</span>'}
    `,
    autoPickFn:     (t, q) => t.shop_number.toLowerCase() === q,
  });

  traderWrap.addEventListener('ac-selected', () => {
    gpCheckBannedTraders();
    setTimeout(() => commodityWrap.querySelector('.ac-input').focus(), 50);
  });

  const unitSelect    = tr.querySelector('.gp-unit');
  const bagsInput     = tr.querySelector('.gp-bags');
  const commodityWrap = tr.querySelector('td:nth-child(2) .ac-wrap');
  const commodityAcInput = commodityWrap.querySelector('.ac-input');

  commodityAcInput.addEventListener('focus', () => {
    const traderId = traderWrap.querySelector('.ac-value').value;
    if (!traderId) {
      traderAcInput.classList.add('error');
      setTimeout(() => traderAcInput.focus(), 50);
    }
  });

  createAutocomplete(commodityWrap, gpState.commodities, {
    filterFn:       (c, q) => c.short_name.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    displayFn:      (c) => `${c.short_name} — ${c.name}`,
    renderItemHTML: (c) => `
      <span class="ac-short-badge">${escapeHtml(c.short_name)}</span>
      <span class="ac-main">${escapeHtml(c.name)}</span>
      <span class="ac-sub">${escapeHtml(c.unit)}</span>
    `,
    autoPickFn:    (c, q) => c.short_name.toLowerCase() === q,
    autoPickSingle: true,
  });

  commodityWrap.addEventListener('ac-selected', () => {
    const commodityId = commodityWrap.querySelector('.ac-value').value;
    if (commodityId) {
      const commodity = gpState.commodities.find(c => String(c.id) === String(commodityId));
      if (commodity && commodity.unit) {
        unitSelect.value = commodity.unit;
      }
    }
    setTimeout(() => {
      if (unitSelect.value) {
        bagsInput.focus();
      } else {
        unitSelect.focus();
      }
    }, 50);
  });

  bagsInput.addEventListener('focus', () => {
    const commodityId = commodityWrap.querySelector('.ac-value').value;
    if (!commodityId) {
      commodityAcInput.classList.add('error');
      setTimeout(() => commodityAcInput.focus(), 50);
    }
  });

  const weightInput = tr.querySelector('.gp-weight');
  const totalSpan   = tr.querySelector('.gp-total-weight');

  weightInput.addEventListener('focus', () => {
    const bags = parseInt(bagsInput.value);
    if (!bags || bags <= 0) {
      bagsInput.classList.add('error');
      setTimeout(() => bagsInput.focus(), 50);
    }
  });

  function updateTotal() {
    const bags  = parseFloat(bagsInput.value)   || 0;
    const wt    = parseFloat(weightInput.value) || 0;
    const total = bags * wt;
    if (bags > 0 && wt > 0) {
      totalSpan.textContent = total % 1 === 0 ? total.toString() : total.toFixed(2);
      totalSpan.classList.add('gp-total-filled');
    } else {
      totalSpan.textContent = '—';
      totalSpan.classList.remove('gp-total-filled');
    }
  }
  bagsInput.addEventListener('input', updateTotal);
  weightInput.addEventListener('input', updateTotal);

  tr.querySelector('.gp-remove-btn').addEventListener('click', () => gpRemoveRow(tr));
  tbody.appendChild(tr);
  tr.querySelector('.ac-input').focus();
}

function gpRemoveRow(tr) {
  const tbody = document.getElementById('gp-items-tbody');
  if (tbody.querySelectorAll('tr').length <= 1) {
    showToast('At least one line item is required', 'error');
    return;
  }
  tr.remove();
}

// ── Banned trader check ───────────────────────────────────
function gpCheckBannedTraders() {
  const rows = [...document.querySelectorAll('#gp-items-tbody tr')];
  let hasBanned = false;

  rows.forEach(row => {
    const traderId = row.querySelector('.gp-trader-id').value;
    if (traderId) {
      const trader = gpState.traders.find(t => String(t.id) === String(traderId));
      if (trader && trader.status === 'banned') {
        hasBanned = true;
        row.querySelector('td:nth-child(1) .ac-input').classList.add('error');
      }
    }
  });

  const warningEl = document.getElementById('gp-banned-warning');
  const saveBtn   = document.getElementById('gp-save-btn');
  warningEl.classList.toggle('hidden', !hasBanned);
  saveBtn.disabled = hasBanned;
  return hasBanned;
}

// ── Keyboard navigation within line items ────────────────
function gpEnterFromWeight(currentRow) {
  const tbody = document.getElementById('gp-items-tbody');
  const rows  = [...tbody.querySelectorAll('tr')];
  const idx   = rows.indexOf(currentRow);

  const traderInput      = currentRow.querySelector('.gp-trader-id');
  const commodityInput   = currentRow.querySelector('.gp-commodity-id');
  const unitSelect       = currentRow.querySelector('.gp-unit');
  const bagsInput        = currentRow.querySelector('.gp-bags');
  const weightInput      = currentRow.querySelector('.gp-weight');
  const traderAcInput    = currentRow.querySelector('td:nth-child(1) .ac-input');
  const commodityAcInput = currentRow.querySelector('td:nth-child(2) .ac-input');

  [traderAcInput, commodityAcInput, unitSelect, bagsInput, weightInput].forEach(el => el.classList.remove('error'));

  let valid = true;
  if (!traderInput.value)    { traderAcInput.classList.add('error');    valid = false; }
  if (!commodityInput.value) { commodityAcInput.classList.add('error'); valid = false; }
  if (!unitSelect.value)     { unitSelect.classList.add('error');       valid = false; }
  const bags = parseInt(bagsInput.value);
  if (!bags || bags <= 0)    { bagsInput.classList.add('error');        valid = false; }
  const wt = parseFloat(weightInput.value);
  if (isNaN(wt) || wt < 0)  { weightInput.classList.add('error');      valid = false; }

  if (!valid) {
    showToast('Complete all required fields in this row first', 'error');
    return;
  }

  if (idx < rows.length - 1) {
    rows[idx + 1].querySelector('td:nth-child(1) .ac-input').focus();
  } else {
    gpAddRow();
  }
}

// ── Save Gate Pass ────────────────────────────────────────
async function gpSaveGatePass(action) {
  if (gpCheckBannedTraders()) {
    return;
  }

  const dateInput = document.getElementById('gp-date');
  const timeInput = document.getElementById('gp-time');
  const date = dateInput.value;
  const time = timeInput.value;
  const vtSelect = document.getElementById('gp-vehicle-type');

  dateInput.classList.remove('error');
  timeInput.classList.remove('error');
  vtSelect.classList.remove('error');

  if (!date) {
    dateInput.classList.add('error');
    return;
  }
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    timeInput.classList.add('error');
    return;
  }
  if (!vtSelect.value) {
    vtSelect.classList.add('error');
    vtSelect.focus();
    return;
  }

  const vehNumberInput = document.getElementById('gp-vehicle-number');
  vehNumberInput.classList.remove('error');
  if (!vehNumberInput.value.trim()) {
    vehNumberInput.classList.add('error');
    vehNumberInput.focus();
    return;
  }

  const rows = [...document.querySelectorAll('#gp-items-tbody tr')];
  if (rows.length === 0) {
    return;
  }

  const items = [];
  let hasError = false;

  rows.forEach((row) => {
    const traderInput    = row.querySelector('.gp-trader-id');
    const traderAcInput  = row.querySelector('td:nth-child(1) .ac-input');
    const commodityInput = row.querySelector('.gp-commodity-id');
    const commodityAcInput = row.querySelector('td:nth-child(2) .ac-input');
    const unitSelect     = row.querySelector('.gp-unit');
    const bagsInput      = row.querySelector('.gp-bags');
    const weightInput    = row.querySelector('.gp-weight');

    [traderAcInput, commodityAcInput, unitSelect, bagsInput, weightInput].forEach(el => el.classList.remove('error'));

    const trader_id    = traderInput.value;
    const commodity_id = commodityInput.value;
    const unit         = unitSelect.value;
    const bagsVal      = bagsInput.value.trim();
    const weightVal    = weightInput.value.trim();
    const number_of_bags  = parseInt(bagsVal, 10);
    const weight_per_bag  = parseFloat(weightVal);

    let rowError = false;
    if (!trader_id)    { traderAcInput.classList.add('error');    rowError = true; }
    if (!commodity_id) { commodityAcInput.classList.add('error'); rowError = true; }
    if (!unit)         { unitSelect.classList.add('error');       rowError = true; }
    if (!bagsVal || isNaN(number_of_bags) || number_of_bags <= 0) {
      bagsInput.classList.add('error'); rowError = true;
    }
    if (weightVal === '' || isNaN(weight_per_bag) || weight_per_bag <= 0) {
      weightInput.classList.add('error'); rowError = true;
    }

    if (rowError) { hasError = true; return; }
    items.push({ trader_id: parseInt(trader_id), commodity_id: parseInt(commodity_id), unit, number_of_bags, weight_per_bag });
  });

  if (hasError) {
    return;
  }

  const allBtns = [
    document.getElementById('gp-save-btn'),
    document.getElementById('gp-save-print-btn'),
    document.getElementById('gp-save-pdf-btn'),
  ];
  allBtns.forEach(b => { b.disabled = true; b.dataset.origHtml = b.innerHTML; });
  allBtns[0].textContent = 'Saving…';

  const vehicle_type_id = document.getElementById('gp-vehicle-type').value || null;
  const vehInput        = document.getElementById('gp-vehicle-number');
  const stateDisp       = document.getElementById('gp-state-display');
  const vehicle_number  = vehInput.value.trim() || null;
  const state_code      = vehicle_number ? (stateDisp.dataset.code || null) : null;
  const state_name      = vehicle_number ? (stateDisp.dataset.name || null) : null;
  const builty_no       = document.getElementById('gp-builty-no').value.trim() || null;

  const { ok, data } = await api('POST', '/api/gate-pass/save', {
    date,
    time,
    items,
    vehicle_type_id: vehicle_type_id ? parseInt(vehicle_type_id) : null,
    vehicle_number,
    state_code,
    state_name,
    builty_no,
  });

  allBtns.forEach(b => { b.disabled = false; b.innerHTML = b.dataset.origHtml; });

  if (ok) {
    showToast(`Gate Pass #${data.gate_pass_number} saved successfully`, 'success');

    if (action === 'print' || action === 'pdf') {
      const detail = await api('GET', `/api/gate-pass/${data.gate_pass_id}/items`);
      if (detail.ok) {
        const html = generateGatePassHTML(detail.data);
        if (action === 'pdf') {
          showToast('Select "Save as PDF" as the printer in the dialog', 'info');
        }
        openPrintWindow(html, true);
      }
    }

    gpResetForm();
  } else {
    showToast(data.error || 'Failed to save gate pass', 'error');
  }
}

async function gpResetForm() {
  const { ok, data } = await api('GET', '/api/gate-pass/next-number');

  document.getElementById('gp-date').value = todayISO();
  document.getElementById('gp-date').classList.remove('error');
  document.getElementById('gp-time').value = nowHM();
  document.getElementById('gp-time').classList.remove('error');

  document.getElementById('gp-vehicle-type').value = '';
  document.getElementById('gp-vehicle-charges').classList.add('hidden');

  const vehInput  = document.getElementById('gp-vehicle-number');
  const stateDisp = document.getElementById('gp-state-display');
  vehInput.value = '';
  vehInput.classList.remove('error');
  stateDisp.value = '';
  stateDisp.classList.remove('state-unknown');
  delete stateDisp.dataset.code;
  delete stateDisp.dataset.name;

  const builtyInput = document.getElementById('gp-builty-no');
  if (builtyInput) { builtyInput.value = ''; builtyInput.classList.remove('error'); }

  const tbody = document.getElementById('gp-items-tbody');
  tbody.innerHTML = '';
  gpState.rowSeq = 0;
  gpAddRow();

  if (ok) document.getElementById('gp-number').value = data.next;

  loadGatePassList();
}

// ── Saved Gate Passes list ────────────────────────────────
async function loadGatePassList() {
  const { ok, data } = await api('GET', '/api/gate-pass/all');
  if (!ok) { showToast('Failed to load gate pass list', 'error'); return; }
  renderGatePassList(data);
}

function renderGatePassList(passes) {
  const tbody = document.getElementById('gp-list-tbody');
  const countBadge = document.getElementById('gp-list-count');
  countBadge.textContent = `${passes.length} record${passes.length !== 1 ? 's' : ''}`;

  if (passes.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No gate passes created yet</td></tr>';
    return;
  }

  tbody.innerHTML = passes.map(p => {
    const traders = p.trader_names ? p.trader_names.split(',').map(n => escapeHtml(n.trim())).join(', ') : '—';
    const { date, time } = gpSplitDateTime(p.created_at);
    const vehicleCell = p.vehicle_number
      ? `<code style="font-size:12px;background:#f1f5f9;padding:2px 6px;border-radius:4px">${escapeHtml(p.vehicle_number)}</code>${p.state_code ? `<br><small class="text-muted">${escapeHtml(p.state_code)}${p.state_name && p.state_name !== 'Unknown' ? ' · ' + escapeHtml(p.state_name) : ''}</small>` : ''}`
      : '—';
    return `
    <tr data-id="${p.id}">
      <td><span class="gp-number-badge">#${p.gate_pass_number}</span></td>
      <td>${traders}</td>
      <td>${vehicleCell}</td>
      <td>${date}</td>
      <td>${time}</td>
      <td><span class="badge">${p.item_count} item${p.item_count !== 1 ? 's' : ''}</span></td>
      <td class="actions-cell">
        <button class="btn btn-icon" onclick="viewGatePass(${p.id})" title="View items">&#128065;</button>
        <button class="btn btn-icon delete" onclick="deleteGatePass(${p.id}, ${p.gate_pass_number})" title="Delete">&#128465;</button>
      </td>
    </tr>
    `;
  }).join('');
}

function gpSplitDateTime(dateStr) {
  if (!dateStr) return { date: '—', time: '—' };
  const hasTime = dateStr.length > 10;
  const d = new Date(hasTime ? dateStr.replace(' ', 'T') : dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return { date: dateStr, time: '—' };
  const pad = n => String(n).padStart(2, '0');
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const time = hasTime ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '—';
  return { date, time };
}

async function viewGatePass(id) {
  const { ok, data } = await api('GET', `/api/gate-pass/${id}/items`);
  if (!ok) { showToast('Failed to load gate pass details', 'error'); return; }

  document.getElementById('gp-view-title').textContent = `Gate Pass #${data.gate_pass_number}`;
  const uniqueTraders = [...new Map(data.items.map(it => [it.trader_name, `${it.trader_name} (${it.shop_number})`])).values()];
  document.getElementById('gp-view-trader').textContent = uniqueTraders.join(', ') || '—';
  document.getElementById('gp-view-date').textContent = gpFormatDate(data.created_at);

  const vehicleWrap = document.getElementById('gp-view-vehicle-wrap');
  const vehicleSpan = document.getElementById('gp-view-vehicle');
  const parts = [];
  if (data.vehicle_type_name) parts.push(`${data.vehicle_type_name} (₹${Number(data.vehicle_charges || 0).toLocaleString('en-IN')})`);
  if (data.vehicle_number)    parts.push(`${data.vehicle_number}${data.state_code ? ' — ' + data.state_code + (data.state_name && data.state_name !== 'Unknown' ? ' ' + data.state_name : '') : ''}`);
  if (parts.length) {
    vehicleSpan.textContent = parts.join(' · ');
    vehicleWrap.style.display = '';
  } else {
    vehicleWrap.style.display = 'none';
  }

  const builtyWrap  = document.getElementById('gp-view-builty-wrap');
  const builtySpan  = document.getElementById('gp-view-builty');
  if (data.builty_no) {
    builtySpan.textContent = data.builty_no;
    builtyWrap.style.display = '';
  } else {
    builtyWrap.style.display = 'none';
  }

  const tbody = document.getElementById('gp-view-tbody');
  if (data.items.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No items found</td></tr>';
  } else {
    const totalBags = data.items.reduce((sum, it) => sum + it.number_of_bags, 0);
    const totalWt   = data.items.reduce((sum, it) => sum + (it.total_weight || 0), 0);
    const fmtNum = n => n % 1 === 0 ? n.toString() : n.toFixed(2);
    tbody.innerHTML = data.items.map((item, i) => {
      const tw = item.total_weight || 0;
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(item.trader_name)}<br><small class="text-muted">${escapeHtml(item.shop_number)}</small></td>
          <td>${escapeHtml(item.commodity_name)}<br><small class="text-muted">${escapeHtml(item.short_name)}</small></td>
          <td>${escapeHtml(item.unit)}</td>
          <td><strong>${item.number_of_bags}</strong></td>
          <td>${item.weight_per_bag > 0 ? item.weight_per_bag : '—'}</td>
          <td>${tw > 0 ? '<strong>' + fmtNum(tw) + '</strong>' : '—'}</td>
        </tr>
      `;
    }).join('') + `
      <tr class="gp-total-row">
        <td colspan="4" style="text-align:right;font-weight:600;color:var(--text-muted)">Total</td>
        <td><strong>${totalBags}</strong></td>
        <td></td>
        <td><strong>${totalWt > 0 ? fmtNum(totalWt) : '—'}</strong></td>
      </tr>
    `;
  }

  document.getElementById('gp-view-modal').classList.remove('hidden');
  document.getElementById('gp-view-modal')._gpData = data;
}

async function deleteGatePass(id, num) {
  const confirmed = await showConfirm(`Delete Gate Pass #${num} and all its items? This cannot be undone.`);
  if (!confirmed) return;

  const { ok, data } = await api('DELETE', `/api/gate-pass/${id}`);
  if (ok) {
    showToast(`Gate Pass #${num} deleted`, 'success');
    loadGatePassList();
  } else {
    showToast(data.error || 'Failed to delete gate pass', 'error');
  }
}

function gpFormatDate(dateStr) {
  if (!dateStr) return '—';
  const hasTime = dateStr.length > 10;
  const d = new Date(hasTime ? dateStr.replace(' ', 'T') : dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const pad = n => String(n).padStart(2, '0');
  const day   = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year  = d.getFullYear();
  if (hasTime) {
    return `${day}/${month}/${year} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${day}/${month}/${year}`;
}

// ── Print / PDF template ──────────────────────────────────
function generateGatePassHTML(data) {
  const fmtNum = n => n % 1 === 0 ? n.toString() : n.toFixed(2);
  const totalBags = data.items.reduce((sum, it) => sum + it.number_of_bags, 0);
  const totalWt   = data.items.reduce((sum, it) => sum + (it.total_weight || 0), 0);

  const uniqueTraders = [...new Map(data.items.map(it => [it.trader_name, `${it.trader_name} (${it.shop_number})`])).values()];

  let vehicleInfo = '';
  if (data.vehicle_type_name) vehicleInfo += data.vehicle_type_name;
  if (data.vehicle_number) vehicleInfo += (vehicleInfo ? ' · ' : '') + data.vehicle_number;
  if (data.state_name && data.state_name !== 'Unknown') vehicleInfo += ` (${data.state_name})`;

  const itemRows = data.items.map((item, i) => {
    const tw = item.total_weight || 0;
    return `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${item.trader_name}<br><small style="color:#888">${item.shop_number}</small></td>
        <td>${item.commodity_name}<br><small style="color:#888">${item.short_name}</small></td>
        <td style="text-align:center">${item.unit}</td>
        <td style="text-align:center;font-weight:600">${item.number_of_bags}</td>
        <td style="text-align:center">${item.weight_per_bag > 0 ? item.weight_per_bag : '—'}</td>
        <td style="text-align:center;font-weight:600">${tw > 0 ? fmtNum(tw) : '—'}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Gate Pass #${data.gate_pass_number}</title>
<style>
  @page { size: A4; margin: 15mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    color: #1a1a1a;
    font-size: 13px;
    line-height: 1.5;
    padding: 0;
  }

  .print-page {
    max-width: 750px;
    margin: 0 auto;
    padding: 20px;
  }

  .print-header {
    text-align: center;
    border-bottom: 3px double #1a6b3a;
    padding-bottom: 14px;
    margin-bottom: 18px;
  }
  .print-header h1 {
    font-size: 22px;
    font-weight: 700;
    color: #1a6b3a;
    letter-spacing: 1px;
  }
  .print-header .subtitle {
    font-size: 11px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-top: 2px;
  }
  .gp-badge {
    display: inline-block;
    background: #1a6b3a;
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    padding: 4px 18px;
    border-radius: 6px;
    margin-top: 10px;
  }

  .print-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 24px;
    background: #f8faf8;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 14px 18px;
    margin-bottom: 18px;
    font-size: 12.5px;
  }
  .print-meta .meta-item {
    display: flex;
    gap: 6px;
  }
  .print-meta .meta-item.full { grid-column: 1 / -1; }
  .meta-key {
    font-weight: 600;
    color: #555;
    white-space: nowrap;
  }
  .meta-val { color: #1a1a1a; }

  .print-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
    font-size: 12.5px;
  }
  .print-table th {
    background: #1a6b3a;
    color: #fff;
    font-weight: 600;
    padding: 8px 10px;
    text-align: left;
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .print-table th:first-child { border-radius: 4px 0 0 0; }
  .print-table th:last-child { border-radius: 0 4px 0 0; }
  .print-table td {
    padding: 7px 10px;
    border-bottom: 1px solid #e0e0e0;
    vertical-align: top;
  }
  .print-table tbody tr:nth-child(even) td {
    background: #fafafa;
  }
  .print-table .total-row td {
    border-top: 2px solid #1a6b3a;
    font-weight: 700;
    background: #f0f7f2;
    font-size: 13px;
  }

  .charges-box {
    background: #e8f5e9;
    border: 1px solid #a5d6a7;
    color: #2e7d32;
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 24px;
    text-align: right;
  }

  .print-signatures {
    display: flex;
    justify-content: space-between;
    margin-top: 50px;
    padding-top: 10px;
  }
  .sig-block {
    text-align: center;
    width: 180px;
  }
  .sig-line {
    border-top: 1px solid #999;
    padding-top: 6px;
    font-size: 11px;
    color: #666;
    font-weight: 600;
  }

  .print-footer {
    text-align: center;
    font-size: 10px;
    color: #999;
    margin-top: 30px;
    padding-top: 10px;
    border-top: 1px solid #eee;
  }

  @media print {
    body { padding: 0; }
    .print-page { padding: 0; max-width: none; }
  }
</style>
</head><body>
<div class="print-page">
  <div class="print-header">
    <h1>MANDI MANAGEMENT SYSTEM</h1>
    <div class="subtitle">Gate Pass Receipt</div>
    <div class="gp-badge">Gate Pass #${data.gate_pass_number}</div>
  </div>

  <div class="print-meta">
    <div class="meta-item">
      <span class="meta-key">Date & Time:</span>
      <span class="meta-val">${gpFormatDate(data.created_at)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-key">Trader(s):</span>
      <span class="meta-val">${uniqueTraders.join(', ') || '—'}</span>
    </div>
    ${vehicleInfo ? `
    <div class="meta-item full">
      <span class="meta-key">Vehicle:</span>
      <span class="meta-val">${vehicleInfo}</span>
    </div>` : ''}
    ${data.builty_no ? `
    <div class="meta-item">
      <span class="meta-key">Builty No.:</span>
      <span class="meta-val">${data.builty_no}</span>
    </div>` : ''}
  </div>

  <table class="print-table">
    <thead>
      <tr>
        <th style="width:30px;text-align:center">#</th>
        <th>Trader</th>
        <th>Commodity</th>
        <th style="width:60px;text-align:center">Measure</th>
        <th style="width:60px;text-align:center">Qty</th>
        <th style="width:70px;text-align:center">Unit</th>
        <th style="width:80px;text-align:center">Total Wt</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      <tr class="total-row">
        <td colspan="4" style="text-align:right">Total</td>
        <td style="text-align:center">${totalBags}</td>
        <td></td>
        <td style="text-align:center">${totalWt > 0 ? fmtNum(totalWt) : '—'}</td>
      </tr>
    </tbody>
  </table>

  ${data.vehicle_charges ? `
  <div class="charges-box">
    Vehicle Charges: <strong>₹${Number(data.vehicle_charges).toLocaleString('en-IN')}</strong>
  </div>` : ''}

  <div class="print-signatures">
    <div class="sig-block"><div class="sig-line">Receiver Signature</div></div>
    <div class="sig-block"><div class="sig-line">Gate Keeper Signature</div></div>
    <div class="sig-block"><div class="sig-line">Authority Signature</div></div>
  </div>

  <div class="print-footer">
    Generated from Mandi Management System &middot; ${new Date().toLocaleDateString('en-IN')}
  </div>
</div>
</body></html>`;
}

// ── Init: wire up all gate pass page listeners ───────────
function initGatePassModule() {
  document.getElementById('gp-vehicle-number').addEventListener('input', (e) => {
    const input = e.target;
    const caret = input.selectionStart;
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    try { input.setSelectionRange(caret, caret); } catch (_) {}
    gpUpdateStateFromVehicle();
  });

  document.getElementById('gp-vehicle-type').addEventListener('change', (e) => {
    e.target.classList.remove('error');
    const chargesDiv = document.getElementById('gp-vehicle-charges');
    const amountSpan = document.getElementById('gp-vehicle-charges-amount');
    const selected = e.target.selectedOptions[0];
    if (selected && selected.value) {
      const charges = parseFloat(selected.dataset.charges) || 0;
      amountSpan.textContent = Number(charges).toLocaleString('en-IN');
      chargesDiv.classList.remove('hidden');
    } else {
      chargesDiv.classList.add('hidden');
    }
  });

  document.getElementById('gp-add-row-btn').addEventListener('click', gpAddRow);

  // Enter on Date → focus vehicle type
  document.getElementById('gp-date').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('gp-vehicle-type').focus();
    }
  });

  // Enter on Vehicle Type → focus first row's Trader input
  document.getElementById('gp-vehicle-type').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!e.target.value) {
        e.target.classList.add('error');
        showToast('Please select a vehicle type', 'error');
        return;
      }
      e.target.classList.remove('error');
      const firstRow = document.querySelector('#gp-items-tbody tr');
      if (firstRow) firstRow.querySelector('td:nth-child(1) .ac-input').focus();
    }
  });

  // Keyboard navigation within line items
  document.getElementById('gp-items-tbody').addEventListener('keydown', function(e) {
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('gp-save-btn').click();
      return;
    }

    if (e.key !== 'Enter') return;

    const row = e.target.closest('tr');
    if (!row) return;

    const unitSelect = row.querySelector('.gp-unit');
    const bagsInput  = row.querySelector('.gp-bags');

    if (e.target === unitSelect) {
      e.preventDefault();
      bagsInput.focus();
      return;
    }

    if (e.target === bagsInput) {
      e.preventDefault();
      row.querySelector('.gp-weight').focus();
      return;
    }

    const weightInput = row.querySelector('.gp-weight');
    if (e.target === weightInput) {
      e.preventDefault();
      gpEnterFromWeight(row);
      return;
    }

    const commodityWrap = row.querySelector('td:nth-child(2) .ac-wrap');
    if (commodityWrap && e.target === commodityWrap.querySelector('.ac-input')) {
      const dropdown = commodityWrap.querySelector('.ac-dropdown');
      if (dropdown.classList.contains('hidden')) {
        e.preventDefault();
        if (unitSelect.value) { bagsInput.focus(); } else { unitSelect.focus(); }
      }
      return;
    }

    const traderWrap = row.querySelector('td:nth-child(1) .ac-wrap');
    if (traderWrap && e.target === traderWrap.querySelector('.ac-input')) {
      const dropdown  = traderWrap.querySelector('.ac-dropdown');
      const traderId  = traderWrap.querySelector('.ac-value').value;
      if (dropdown.classList.contains('hidden') && traderId) {
        e.preventDefault();
        commodityWrap.querySelector('.ac-input').focus();
      }
      return;
    }
  });

  // Save buttons
  document.getElementById('gp-save-btn').addEventListener('click', () => gpSaveGatePass('save'));
  document.getElementById('gp-save-print-btn').addEventListener('click', () => gpSaveGatePass('print'));
  document.getElementById('gp-save-pdf-btn').addEventListener('click', () => gpSaveGatePass('pdf'));

  // View modal print / PDF buttons
  document.getElementById('gp-print-btn').addEventListener('click', () => {
    const data = document.getElementById('gp-view-modal')._gpData;
    if (!data) return;
    const html = generateGatePassHTML(data);
    openPrintWindow(html, true);
  });

  document.getElementById('gp-pdf-btn').addEventListener('click', () => {
    const data = document.getElementById('gp-view-modal')._gpData;
    if (!data) return;
    const html = generateGatePassHTML(data);
    showToast('In the print dialog, select "Save as PDF" as the printer', 'info');
    openPrintWindow(html, true);
  });

  // Search gate pass by number
  async function gpSearchByNumber() {
    const input = document.getElementById('gp-search-input');
    const errorEl = document.getElementById('gp-search-error');
    const num = parseInt(input.value, 10);
    errorEl.style.display = 'none';
    if (!num || num <= 0) {
      errorEl.textContent = 'Please enter a valid gate pass number';
      errorEl.style.display = '';
      return;
    }
    const { ok, data } = await api('GET', `/api/gate-pass/search?num=${num}`);
    if (!ok) {
      errorEl.textContent = data.error || `Gate Pass #${num} not found`;
      errorEl.style.display = '';
      return;
    }
    input.value = '';
    viewGatePass(data.id);
  }

  document.getElementById('gp-search-btn').addEventListener('click', gpSearchByNumber);
  document.getElementById('gp-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); gpSearchByNumber(); }
  });

  // View modal close buttons
  ['gp-view-close', 'gp-view-close-bottom'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      document.getElementById('gp-view-modal').classList.add('hidden');
    });
  });
  document.getElementById('gp-view-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('gp-view-modal')) {
      document.getElementById('gp-view-modal').classList.add('hidden');
    }
  });
}
