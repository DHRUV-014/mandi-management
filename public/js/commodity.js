/* ============================================================
   MANDI — Commodity Master
   ============================================================ */

let editingCommodityId = null;

async function loadCommodities() {
  const formCard = document.getElementById('commodity-form-card');
  if (state.user?.level === 'superadmin' && !state.user?.current_mandi_id) {
    if (formCard) formCard.style.display = 'none';
    const tbody = document.getElementById('commodity-tbody');
    if (tbody) tbody.innerHTML = '<tr class="empty-row"><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">Select a mandi from the context bar above to continue</td></tr>';
    const badge = document.getElementById('commodity-count');
    if (badge) badge.textContent = '0 records';
    return;
  }
  if (formCard) formCard.style.display = '';
  const { ok, data } = await api('GET', '/api/commodities');
  if (!ok) { showToast('Failed to load commodities', 'error'); return; }
  renderCommodityTable(data);
}

function renderCommodityTable(commodities) {
  const tbody = document.getElementById('commodity-tbody');
  const countBadge = document.getElementById('commodity-count');
  countBadge.textContent = `${commodities.length} record${commodities.length !== 1 ? 's' : ''}`;

  if (commodities.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No commodities added yet</td></tr>';
    return;
  }

  const isAdmin = state.user && state.user.level === 'admin';
  tbody.innerHTML = commodities.map((c, i) => `
    <tr data-id="${c.id}">
      <td>${i + 1}</td>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.unit)}</td>
      <td><code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:12px">${escapeHtml(c.short_name)}</code></td>
      ${isAdmin ? `<td class="actions-cell">
        <button class="btn btn-icon edit" onclick="editCommodity(${c.id})" title="Edit">&#9998;</button>
        <button class="btn btn-icon delete" onclick="deleteCommodity(${c.id}, '${escapeHtml(c.name)}')" title="Delete">&#128465;</button>
      </td>` : '<td></td>'}
    </tr>
  `).join('');
}

function editCommodity(id) {
  const row = document.querySelector(`#commodity-tbody tr[data-id="${id}"]`);
  if (!row) return;

  const cells = row.querySelectorAll('td');
  const name = cells[1].textContent.trim();
  const unit = cells[2].textContent.trim();
  const shortName = cells[3].querySelector('code').textContent.trim();

  document.getElementById('commodity-name').value = name;
  document.getElementById('commodity-unit').value = unit;
  document.getElementById('commodity-short-name').value = shortName;
  document.getElementById('commodity-edit-id').value = id;
  document.getElementById('commodity-form-title').textContent = 'Edit Commodity';
  document.getElementById('commodity-submit-btn').textContent = 'Update Commodity';
  document.getElementById('commodity-cancel-btn').style.display = 'inline-flex';
  document.getElementById('commodity-name').focus();

  editingCommodityId = id;
}

async function deleteCommodity(id, name) {
  const confirmed = await showConfirm(`Delete commodity "${name}"? This action cannot be undone.`);
  if (!confirmed) return;

  const { ok, data } = await api('DELETE', `/api/commodities/${id}`);
  if (ok) {
    showToast('Commodity deleted', 'success');
    loadCommodities();
  } else {
    showToast(data.error || 'Failed to delete', 'error');
  }
}

function resetCommodityForm() {
  document.getElementById('commodity-form').reset();
  document.getElementById('commodity-edit-id').value = '';
  document.getElementById('commodity-form-title').textContent = 'Add New Commodity';
  document.getElementById('commodity-submit-btn').textContent = 'Save Commodity';
  document.getElementById('commodity-cancel-btn').style.display = 'none';
  document.querySelectorAll('#commodity-form input, #commodity-form select').forEach(el => el.classList.remove('error'));
  editingCommodityId = null;
}

function initCommodityModule() {
  document.getElementById('commodity-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('commodity-name');
    const unitInput = document.getElementById('commodity-unit');
    const shortInput = document.getElementById('commodity-short-name');

    const name = nameInput.value.trim();
    const unit = unitInput.value;
    const short_name = shortInput.value.trim();

    [nameInput, unitInput, shortInput].forEach(el => el.classList.remove('error'));

    if (!name || !unit || !short_name) {
      showToast('Please fill in all required fields', 'error');
      if (!name) nameInput.classList.add('error');
      if (!unit) unitInput.classList.add('error');
      if (!short_name) shortInput.classList.add('error');
      return;
    }

    const isEdit = !!editingCommodityId;
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `/api/commodities/${editingCommodityId}` : '/api/commodities';

    const btn = document.getElementById('commodity-submit-btn');
    btn.disabled = true;

    const { ok, data } = await api(method, url, { name, unit, short_name });

    btn.disabled = false;

    if (ok) {
      showToast(isEdit ? 'Commodity updated successfully' : 'Commodity added successfully', 'success');
      resetCommodityForm();
      loadCommodities();
    } else {
      showToast(data.error || 'Failed to save commodity', 'error');
      if (data.error && data.error.toLowerCase().includes('name')) nameInput.classList.add('error');
      if (data.error && data.error.toLowerCase().includes('short')) shortInput.classList.add('error');
    }
  });

  document.getElementById('commodity-cancel-btn').addEventListener('click', resetCommodityForm);
}
