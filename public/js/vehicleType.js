/* ============================================================
   MANDI — Vehicle Type Master
   ============================================================ */

let editingVehicleTypeId = null;

async function loadVehicleTypes() {
  const formCard = document.getElementById('vehicle-form-card');
  if (state.user?.level === 'superadmin' && !state.user?.current_mandi_id) {
    if (formCard) formCard.style.display = 'none';
    const tbody = document.getElementById('vehicle-tbody');
    if (tbody) tbody.innerHTML = '<tr class="empty-row"><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted)">Select a mandi from the context bar above to continue</td></tr>';
    const badge = document.getElementById('vehicle-count');
    if (badge) badge.textContent = '0 records';
    return;
  }
  if (formCard) formCard.style.display = '';
  const { ok, data } = await api('GET', '/api/vehicle-types');
  if (!ok) { showToast('Failed to load vehicle types', 'error'); return; }
  renderVehicleTypeTable(data);
}

function renderVehicleTypeTable(types) {
  const tbody = document.getElementById('vehicle-tbody');
  const countBadge = document.getElementById('vehicle-count');
  countBadge.textContent = `${types.length} record${types.length !== 1 ? 's' : ''}`;

  if (types.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No vehicle types added yet</td></tr>';
    return;
  }

  const isAdmin = state.user && state.user.level === 'admin';
  tbody.innerHTML = types.map((v, i) => `
    <tr data-id="${v.id}">
      <td>${i + 1}</td>
      <td>${escapeHtml(v.name)}</td>
      <td>₹${Number(v.charges).toLocaleString('en-IN')}</td>
      ${isAdmin ? `<td class="actions-cell">
        <button class="btn btn-icon edit" onclick="editVehicleType(${v.id})" title="Edit">&#9998;</button>
        <button class="btn btn-icon delete" onclick="deleteVehicleType(${v.id}, '${escapeHtml(v.name)}')" title="Delete">&#128465;</button>
      </td>` : '<td></td>'}
    </tr>
  `).join('');
}

function editVehicleType(id) {
  const row = document.querySelector(`#vehicle-tbody tr[data-id="${id}"]`);
  if (!row) return;

  const cells = row.querySelectorAll('td');
  const name    = cells[1].textContent.trim();
  const chargesText = cells[2].textContent.replace(/[₹,]/g, '').trim();

  document.getElementById('vehicle-type-name').value    = name;
  document.getElementById('vehicle-type-charges').value = chargesText;
  document.getElementById('vehicle-edit-id').value      = id;
  document.getElementById('vehicle-form-title').textContent = 'Edit Vehicle Type';
  document.getElementById('vehicle-submit-btn').textContent = 'Update Vehicle Type';
  document.getElementById('vehicle-cancel-btn').style.display = 'inline-flex';
  document.getElementById('vehicle-type-name').focus();

  editingVehicleTypeId = id;
  document.getElementById('vehicle-form-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function deleteVehicleType(id, name) {
  const confirmed = await showConfirm(`Delete vehicle type "${name}"? This action cannot be undone.`);
  if (!confirmed) return;

  const { ok, data } = await api('DELETE', `/api/vehicle-types/${id}`);
  if (ok) {
    showToast('Vehicle type deleted', 'success');
    loadVehicleTypes();
  } else {
    showToast(data.error || 'Failed to delete', 'error');
  }
}

function resetVehicleTypeForm() {
  document.getElementById('vehicle-form').reset();
  document.getElementById('vehicle-edit-id').value = '';
  document.getElementById('vehicle-form-title').textContent = 'Add New Vehicle Type';
  document.getElementById('vehicle-submit-btn').textContent = 'Save Vehicle Type';
  document.getElementById('vehicle-cancel-btn').style.display = 'none';
  document.querySelectorAll('#vehicle-form input').forEach(el => el.classList.remove('error'));
  editingVehicleTypeId = null;
}

function initVehicleTypeModule() {
  document.getElementById('vehicle-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput    = document.getElementById('vehicle-type-name');
    const chargesInput = document.getElementById('vehicle-type-charges');

    const name    = nameInput.value.trim();
    const charges = chargesInput.value.trim();

    [nameInput, chargesInput].forEach(el => el.classList.remove('error'));

    if (!name || charges === '') {
      showToast('Please fill in all required fields', 'error');
      if (!name)       nameInput.classList.add('error');
      if (charges === '') chargesInput.classList.add('error');
      return;
    }

    const isEdit = !!editingVehicleTypeId;
    const method = isEdit ? 'PUT' : 'POST';
    const url    = isEdit ? `/api/vehicle-types/${editingVehicleTypeId}` : '/api/vehicle-types';

    const btn = document.getElementById('vehicle-submit-btn');
    btn.disabled = true;

    const { ok, data } = await api(method, url, { name, charges: parseFloat(charges) });

    btn.disabled = false;

    if (ok) {
      showToast(isEdit ? 'Vehicle type updated successfully' : 'Vehicle type added successfully', 'success');
      resetVehicleTypeForm();
      loadVehicleTypes();
    } else {
      showToast(data.error || 'Failed to save vehicle type', 'error');
      if (data.error && data.error.toLowerCase().includes('name')) nameInput.classList.add('error');
    }
  });

  document.getElementById('vehicle-cancel-btn').addEventListener('click', resetVehicleTypeForm);
}
