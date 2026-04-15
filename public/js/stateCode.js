/* ============================================================
   MANDI — State Code Master
   ============================================================ */

let editingStateId = null;
let allStates = [];

async function loadStates() {
  const { ok, data } = await api('GET', '/api/states/all');
  if (!ok) { showToast('Failed to load state codes', 'error'); return; }
  allStates = data;
  const searchEl = document.getElementById('state-search');
  if (searchEl) searchEl.value = '';
  renderStateTable(data);
}

function renderStateTable(states) {
  const tbody = document.getElementById('state-tbody');
  const countBadge = document.getElementById('state-count');
  countBadge.textContent = `${states.length} record${states.length !== 1 ? 's' : ''}`;

  if (states.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No state codes found</td></tr>';
    return;
  }

  const isAdmin = state.user && state.user.level === 'admin';
  tbody.innerHTML = states.map((s, i) => `
    <tr data-id="${s.id}">
      <td>${i + 1}</td>
      <td><span class="state-code-badge">${escapeHtml(s.state_code)}</span></td>
      <td>${escapeHtml(s.state_name)}</td>
      ${isAdmin ? `<td class="actions-cell">
        <button class="btn btn-icon edit"   onclick="editState(${s.id})" title="Edit">&#9998;</button>
        <button class="btn btn-icon delete" onclick="deleteState(${s.id}, '${escapeHtml(s.state_code)}')" title="Delete">&#128465;</button>
      </td>` : '<td></td>'}
    </tr>
  `).join('');
}

function editState(id) {
  const row = document.querySelector(`#state-tbody tr[data-id="${id}"]`);
  if (!row) return;
  const cells = row.querySelectorAll('td');
  const code = cells[1].querySelector('.state-code-badge').textContent.trim();
  const name = cells[2].textContent.trim();

  document.getElementById('state-code').value = code;
  document.getElementById('state-name').value = name;
  document.getElementById('state-edit-id').value = id;
  document.getElementById('state-form-title').textContent = 'Edit State Code';
  document.getElementById('state-submit-btn').textContent = 'Update State';
  document.getElementById('state-cancel-btn').style.display = 'inline-flex';
  document.getElementById('state-code').focus();
  editingStateId = id;
  document.getElementById('state-form-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function deleteState(id, code) {
  const confirmed = await showConfirm(`Delete state code "${code}"? This action cannot be undone.`);
  if (!confirmed) return;
  const { ok, data } = await api('DELETE', `/api/states/${id}`);
  if (ok) {
    showToast('State deleted', 'success');
    loadStates();
  } else {
    showToast(data.error || 'Failed to delete', 'error');
  }
}

function resetStateForm() {
  document.getElementById('state-form').reset();
  document.getElementById('state-edit-id').value = '';
  document.getElementById('state-form-title').textContent = 'Add New State Code';
  document.getElementById('state-submit-btn').textContent = 'Save State';
  document.getElementById('state-cancel-btn').style.display = 'none';
  document.querySelectorAll('#state-form input').forEach(el => el.classList.remove('error'));
  editingStateId = null;
}

function initStateCodeModule() {
  document.getElementById('state-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { renderStateTable(allStates); return; }
    const filtered = allStates.filter(s =>
      s.state_code.toLowerCase().includes(q) || s.state_name.toLowerCase().includes(q)
    );
    renderStateTable(filtered);
  });

  document.getElementById('state-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codeInput = document.getElementById('state-code');
    const nameInput = document.getElementById('state-name');

    const state_code = codeInput.value.trim().toUpperCase();
    const state_name = nameInput.value.trim();

    [codeInput, nameInput].forEach(el => el.classList.remove('error'));

    if (!state_code || !state_name) {
      showToast('Please fill in all required fields', 'error');
      if (!state_code) codeInput.classList.add('error');
      if (!state_name) nameInput.classList.add('error');
      return;
    }
    if (!/^[A-Z]{2}$/.test(state_code)) {
      codeInput.classList.add('error');
      showToast('State code must be exactly 2 letters', 'error');
      return;
    }

    const isEdit = !!editingStateId;
    const method = isEdit ? 'PUT' : 'POST';
    const url    = isEdit ? `/api/states/${editingStateId}` : '/api/states/add';

    const btn = document.getElementById('state-submit-btn');
    btn.disabled = true;

    const { ok, data } = await api(method, url, { state_code, state_name });

    btn.disabled = false;

    if (ok) {
      showToast(isEdit ? 'State updated successfully' : 'State added successfully', 'success');
      resetStateForm();
      loadStates();
    } else {
      showToast(data.error || 'Failed to save state', 'error');
      if (data.error && data.error.toLowerCase().includes('code')) codeInput.classList.add('error');
    }
  });

  document.getElementById('state-cancel-btn').addEventListener('click', resetStateForm);
}
