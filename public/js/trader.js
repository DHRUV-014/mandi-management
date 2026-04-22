/* ============================================================
   MANDI — Trader Master
   ============================================================ */

let editingTraderId = null;
let allTraders = [];

async function loadTraders() {
  const formCard = document.getElementById('trader-form-card');
  if (state.user?.level === 'superadmin' && !state.user?.current_mandi_id) {
    if (formCard) formCard.style.display = 'none';
    const tbody = document.getElementById('trader-tbody');
    if (tbody) tbody.innerHTML = '<tr class="empty-row"><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">Select a mandi from the context bar above to continue</td></tr>';
    const badge = document.getElementById('trader-count');
    if (badge) badge.textContent = '0 records';
    return;
  }
  if (formCard) formCard.style.display = '';
  const { ok, data } = await api('GET', '/api/traders');
  if (!ok) { showToast('Failed to load traders', 'error'); return; }
  allTraders = data;
  const searchEl = document.getElementById('trader-search');
  if (searchEl) searchEl.value = '';
  renderTraderTable(data);
}

function renderTraderTable(traders) {
  const tbody = document.getElementById('trader-tbody');
  const countBadge = document.getElementById('trader-count');
  countBadge.textContent = `${traders.length} record${traders.length !== 1 ? 's' : ''}`;

  if (traders.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No traders added yet</td></tr>';
    return;
  }

  const isAdmin = state.user && state.user.level === 'admin';
  tbody.innerHTML = traders.map((t, i) => {
    const status      = t.status || 'active';
    const statusBadge = `<span class="status-badge status-${status}">${status === 'banned' ? 'Banned' : 'Active'}</span>`;
    const toggleBtn   = status === 'banned'
      ? `<button class="btn btn-activate" onclick="toggleTraderStatus(${t.id}, 'banned')" title="Activate this trader">&#10003; Activate</button>`
      : `<button class="btn btn-ban"      onclick="toggleTraderStatus(${t.id}, 'active')"  title="Ban this trader">&#128683; Ban</button>`;
    return `
    <tr data-id="${t.id}" data-phone="${escapeHtml(t.phone_number || '')}" data-status="${status}">
      <td>${i + 1}</td>
      <td>${escapeHtml(t.trader_name)}</td>
      <td>${escapeHtml(t.shop_number)}</td>
      <td>${escapeHtml(t.license_number)}</td>
      <td>${escapeHtml(t.phone_number || '—')}</td>
      <td>${statusBadge}</td>
      ${isAdmin ? `<td class="actions-cell">
        <button class="btn btn-icon edit"   onclick="editTrader(${t.id})"                              title="Edit">&#9998;</button>
        ${toggleBtn}
        <button class="btn btn-icon delete" onclick="deleteTrader(${t.id}, '${escapeHtml(t.trader_name)}')" title="Delete">&#128465;</button>
      </td>` : '<td></td>'}
    </tr>`;
  }).join('');
}

function editTrader(id) {
  const row = document.querySelector(`#trader-tbody tr[data-id="${id}"]`);
  if (!row) return;

  const cells = row.querySelectorAll('td');
  document.getElementById('trader-name').value          = cells[1].textContent.trim();
  document.getElementById('trader-shop-number').value   = cells[2].textContent.trim();
  document.getElementById('trader-license-number').value= cells[3].textContent.trim();
  const phoneRaw = row.dataset.phone || '';
  document.getElementById('trader-phone-number').value  = phoneRaw;
  document.getElementById('trader-edit-id').value       = id;
  document.getElementById('trader-form-title').textContent = 'Edit Trader';
  document.getElementById('trader-submit-btn').textContent = 'Update Trader';
  document.getElementById('trader-cancel-btn').style.display = 'inline-flex';
  document.getElementById('trader-name').focus();

  editingTraderId = id;
  document.getElementById('trader-form-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function deleteTrader(id, name) {
  const confirmed = await showConfirm(`Delete trader "${name}"? This action cannot be undone.`);
  if (!confirmed) return;

  const { ok, data } = await api('DELETE', `/api/traders/${id}`);
  if (ok) {
    showToast('Trader deleted', 'success');
    loadTraders();
  } else {
    showToast(data.error || 'Failed to delete', 'error');
  }
}

async function toggleTraderStatus(id, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'banned' : 'active';
  const row = document.querySelector(`#trader-tbody tr[data-id="${id}"]`);
  const traderName = row ? row.querySelectorAll('td')[1].textContent.trim() : 'this trader';
  const action = newStatus === 'banned' ? 'ban' : 'activate';
  const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);

  const confirmed = await showConfirm(
    `${actionLabel} trader "${traderName}"?`,
    {
      title: `Confirm ${actionLabel}`,
      confirmText: actionLabel,
      btnClass: newStatus === 'banned' ? 'btn btn-danger' : 'btn btn-primary',
    }
  );
  if (!confirmed) return;

  const { ok, data } = await api('PATCH', `/api/traders/${id}/status`, { status: newStatus });
  if (ok) {
    showToast(`Trader ${newStatus === 'banned' ? 'banned' : 'activated'} successfully`, newStatus === 'banned' ? 'error' : 'success');
    loadTraders();
  } else {
    showToast(data.error || 'Failed to update status', 'error');
  }
}

function resetTraderForm() {
  document.getElementById('trader-form').reset();
  document.getElementById('trader-edit-id').value       = '';
  document.getElementById('trader-phone-number').value  = '';
  document.getElementById('trader-form-title').textContent = 'Add New Trader';
  document.getElementById('trader-submit-btn').textContent = 'Save Trader';
  document.getElementById('trader-cancel-btn').style.display = 'none';
  document.querySelectorAll('#trader-form input').forEach(el => el.classList.remove('error'));
  editingTraderId = null;
}

function initTraderModule() {
  document.getElementById('trader-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { renderTraderTable(allTraders); return; }
    const filtered = allTraders.filter(t =>
      t.trader_name.toLowerCase().includes(q) ||
      t.shop_number.toLowerCase().includes(q) ||
      t.license_number.toLowerCase().includes(q) ||
      (t.phone_number && t.phone_number.toLowerCase().includes(q))
    );
    renderTraderTable(filtered);
  });

  document.getElementById('trader-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput    = document.getElementById('trader-name');
    const shopInput    = document.getElementById('trader-shop-number');
    const licenseInput = document.getElementById('trader-license-number');
    const phoneInput   = document.getElementById('trader-phone-number');

    const trader_name    = nameInput.value.trim();
    const shop_number    = shopInput.value.trim();
    const license_number = licenseInput.value.trim();
    const phone_number   = phoneInput.value.trim();

    [nameInput, shopInput, licenseInput, phoneInput].forEach(el => el.classList.remove('error'));

    if (!trader_name || !shop_number || !license_number) {
      showToast('Please fill in all required fields', 'error');
      if (!trader_name)    nameInput.classList.add('error');
      if (!shop_number)    shopInput.classList.add('error');
      if (!license_number) licenseInput.classList.add('error');
      return;
    }

    if (phone_number && !/^\d{1,15}$/.test(phone_number)) {
      showToast('Phone number must be numeric, up to 15 digits', 'error');
      phoneInput.classList.add('error');
      return;
    }

    const isEdit = !!editingTraderId;
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `/api/traders/${editingTraderId}` : '/api/traders';

    const btn = document.getElementById('trader-submit-btn');
    btn.disabled = true;

    const { ok, data } = await api(method, url, { trader_name, shop_number, license_number, phone_number: phone_number || null });

    btn.disabled = false;

    if (ok) {
      showToast(isEdit ? 'Trader updated successfully' : 'Trader added successfully', 'success');
      resetTraderForm();
      loadTraders();
    } else {
      showToast(data.error || 'Failed to save trader', 'error');
      if (data.error && data.error.toLowerCase().includes('shop'))    shopInput.classList.add('error');
      if (data.error && data.error.toLowerCase().includes('license')) licenseInput.classList.add('error');
    }
  });

  document.getElementById('trader-cancel-btn').addEventListener('click', resetTraderForm);
}
