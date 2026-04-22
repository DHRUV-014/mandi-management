/* ============================================================
   MANDI — User Management
   ============================================================ */

const FEATURE_LABELS = {
  gate_pass:           'Gate Pass Entry',
  rate_entry:          'Daily Rate Entry',
  reports:             'Reports',
  commodity_master:    'Commodity Master',
  trader_master:       'Trader / Shop Master',
  vehicle_type_master: 'Vehicle Type Master',
  state_master:        'State Codes',
  user_management:     'User Management',
  view_past_fy:        'View Past Financial Year Data',
};

let umAllMandis  = [];  // loaded once for superadmin
let umAllUsers   = [];  // last-loaded user list

async function loadUserManagement() {
  const { ok, data } = await api('GET', '/api/users/all');
  if (!ok) { renderUserTable([], false); return; }

  umAllUsers = data;
  const isSuperAdmin = state.user?.level === 'superadmin';

  // Show mandi column + perms column for superadmin
  document.getElementById('um-mandi-th')?.classList.toggle('hidden', !isSuperAdmin);
  document.getElementById('um-perms-th')?.classList.toggle('hidden', !isSuperAdmin);
  document.getElementById('um-filter-mandi')?.classList.toggle('hidden', !isSuperAdmin);

  if (isSuperAdmin && !umAllMandis.length) {
    const { ok: mok, data: mandis } = await api('GET', '/api/mandis');
    if (mok) umAllMandis = mandis;
    populateMandiFilter();
  }

  applyUserFilter();
}

function populateMandiFilter() {
  const sel = document.getElementById('um-filter-mandi');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">All Mandis</option>' +
    umAllMandis.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  sel.value = current;
}

function applyUserFilter() {
  const isSuperAdmin = state.user?.level === 'superadmin';
  const filterMandi = isSuperAdmin ? (document.getElementById('um-filter-mandi')?.value || '') : '';

  let users = umAllUsers;
  if (filterMandi) {
    users = users.filter(u =>
      String(u.mandi_id) === filterMandi ||
      (u.assignedMandis || []).some(m => String(m.id) === filterMandi)
    );
  }
  renderUserTable(users, isSuperAdmin);
}

function renderUserTable(users, showMandi) {
  const tbody = document.getElementById('user-tbody');
  document.getElementById('user-count').textContent = `${users.length}`;

  if (!users.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px">No users found</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map((u, i) => {
    const isSelf = u.id === state.user?.id;

    const levelBadge = {
      superadmin: `<span class="level-badge" style="background:#7c3aed;color:#fff">Super Admin</span>`,
      admin:      `<span class="level-badge level-admin">Admin</span>`,
      user:       `<span class="level-badge level-user">Operator</span>`,
    }[u.level] || `<span class="level-badge">${escapeHtml(u.level)}</span>`;

    const mandiCell = showMandi ? (() => {
      const list = u.assignedMandis?.length
        ? u.assignedMandis.map(m => `<span class="mandi-chip">${escapeHtml(m.prefix)}</span>`).join('')
        : (u.mandi_name ? `<span class="mandi-chip">${escapeHtml(u.mandi_name)}</span>` : '<span style="color:var(--text-muted)">—</span>');
      return `<td>${list}</td>`;
    })() : '';

    const permsCell = showMandi ? (() => {
      if (u.level === 'superadmin') return `<td><span style="color:var(--text-muted);font-size:12px">Full access</span></td>`;
      const perms = u.permissions;
      if (!perms) return `<td><span style="color:var(--text-muted);font-size:12px">Default</span></td>`;
      const names = perms.map(f => FEATURE_LABELS[f] || f).join(', ');
      return `<td style="font-size:11px;color:var(--text-muted);line-height:1.4">${escapeHtml(names) || '—'}</td>`;
    })() : '';

    const canDelete = !isSelf && u.level !== 'superadmin';
    const canEdit   = state.user?.level === 'superadmin' && u.level !== 'superadmin';
    const createdAt = u.created_at ? String(u.created_at).slice(0, 10) : '—';

    return `
      <tr>
        <td style="color:var(--text-muted)">${i + 1}</td>
        <td>
          <span style="font-weight:600">${escapeHtml(u.username)}</span>
          ${isSelf ? '<span class="self-badge">you</span>' : ''}
        </td>
        <td>${levelBadge}</td>
        ${mandiCell}
        ${permsCell}
        <td style="font-size:12px;color:var(--text-muted)">${createdAt}</td>
        <td class="actions-cell" style="display:flex;gap:6px;flex-wrap:wrap">
          ${canEdit ? `<button class="btn btn-outline btn-sm" onclick="openEditUser(${u.id})">Edit</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="openResetPwd(${u.id}, '${escapeHtml(u.username)}')" title="Reset password">&#128273;</button>
          ${canDelete ? `<button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca" onclick="deleteUser(${u.id}, '${escapeHtml(u.username)}')" title="Delete">&#128465;</button>` : ''}
        </td>
      </tr>`;
  }).join('');
}

/* ── Permission toggle helpers ──────────────── */

function buildPermsGrid(containerId, currentPerms, forLevel) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const features = forLevel === 'admin'
    ? ALL_FEATURES
    : [...DEFAULT_USER_FEATURES, 'view_past_fy'];
  const isAll    = !currentPerms;

  container.innerHTML = features.map(f => {
    const checked = isAll || (Array.isArray(currentPerms) && currentPerms.includes(f));
    return `
      <label class="perm-toggle">
        <span class="perm-switch">
          <input type="checkbox" name="perm" value="${f}" ${checked ? 'checked' : ''}>
          <span class="perm-switch-track"></span>
        </span>
        <span class="perm-toggle-label">${FEATURE_LABELS[f] || f}</span>
      </label>`;
  }).join('');
}

function getCheckedPerms(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return null;
  const boxes = Array.from(el.querySelectorAll('input[name="perm"]'));
  const all   = boxes.every(b => b.checked);
  return all ? null : boxes.filter(b => b.checked).map(b => b.value);
}

/* ── Edit User Modal ──────────────────────── */

function openEditUser(userId) {
  const u = umAllUsers.find(x => x.id === userId);
  if (!u) return;

  document.getElementById('eu-user-id').value = userId;
  document.getElementById('eu-modal-title').textContent   = `Edit — ${u.username}`;
  document.getElementById('eu-modal-subtitle').textContent = `Level: ${u.level} · Created: ${String(u.created_at || '').slice(0,10)}`;
  document.getElementById('eu-pwd-new').value     = '';
  document.getElementById('eu-pwd-confirm').value = '';
  document.getElementById('eu-pwd-error').classList.add('hidden');

  // Mandi section: show for non-superadmin users
  const mandiSection = document.getElementById('eu-mandi-section');
  const mandiList    = document.getElementById('eu-mandi-list');
  const permsSection = document.getElementById('eu-perms-section');

  mandiSection.classList.toggle('hidden', u.level === 'superadmin');
  permsSection.classList.toggle('hidden', u.level === 'superadmin');

  if (u.level !== 'superadmin') {
    const assignedIds = (u.assignedMandis || []).map(m => m.id);
    mandiList.innerHTML = umAllMandis.map(m => `
      <label class="mandi-assign-toggle">
        <input type="checkbox" name="eu-mandi" value="${m.id}" ${assignedIds.includes(m.id) ? 'checked' : ''}>
        <span class="mandi-assign-badge ${assignedIds.includes(m.id) ? 'checked' : ''}">
          <span class="mandi-assign-prefix">${escapeHtml(m.prefix)}</span>
          ${escapeHtml(m.name)}
        </span>
      </label>`).join('');

    // Sync checkbox state visually
    mandiList.querySelectorAll('input[name="eu-mandi"]').forEach(cb => {
      cb.addEventListener('change', () => {
        cb.closest('label').querySelector('.mandi-assign-badge').classList.toggle('checked', cb.checked);
      });
    });

    buildPermsGrid('eu-perms-grid', u.permissions, u.level);
  }

  document.getElementById('edit-user-modal').classList.remove('hidden');
}

async function deleteUser(id, username) {
  const confirmed = await showConfirm(
    `Delete user "${username}"? This cannot be undone.`,
    { title: 'Delete User', confirmText: 'Delete', btnClass: 'btn btn-danger' }
  );
  if (!confirmed) return;
  const { ok, data } = await api('DELETE', `/api/users/${id}`);
  if (ok) { showToast(`"${username}" deleted`, 'success'); loadUserManagement(); }
  else showToast(data.error || 'Failed to delete user', 'error');
}

function openResetPwd(userId, username) {
  document.getElementById('rp-user-id').value = userId;
  document.getElementById('rp-label').textContent = `Set a new password for: ${username}`;
  document.getElementById('rp-new').value = '';
  document.getElementById('rp-confirm').value = '';
  document.getElementById('rp-error').classList.add('hidden');
  document.getElementById('reset-pwd-modal').classList.remove('hidden');
}

/* ── Init ──────────────────────────────────── */

function initUserManagementModule() {
  // Mandi filter
  document.getElementById('um-filter-mandi')?.addEventListener('change', applyUserFilter);

  // Toggle add form
  document.getElementById('um-add-toggle-btn')?.addEventListener('click', () => {
    const card    = document.getElementById('um-add-card');
    const visible = card.style.display !== 'none';
    card.style.display = visible ? 'none' : '';
    if (!visible) {
      document.getElementById('user-add-form').reset();
      document.getElementById('um-add-error').classList.add('hidden');
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setupAddFormForRole();
    }
  });

  ['um-add-cancel','um-add-cancel2'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      document.getElementById('um-add-card').style.display = 'none';
    });
  });

  // Level change updates mandi + perms sections
  document.getElementById('new-level')?.addEventListener('change', setupAddFormForRole);

  // Add form submit
  document.getElementById('user-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errDiv    = document.getElementById('um-add-error');
    errDiv.classList.add('hidden');
    const username  = document.getElementById('new-username').value.trim();
    const password  = document.getElementById('new-password').value;
    const level     = document.getElementById('new-level').value;
    const isSuperAdmin = state.user?.level === 'superadmin';

    if (!username) { errDiv.textContent = 'Username is required'; errDiv.classList.remove('hidden'); return; }
    if (password.length < 6) { errDiv.textContent = 'Password must be at least 6 characters'; errDiv.classList.remove('hidden'); return; }

    const payload = { username, password, level };

    if (isSuperAdmin) {
      const checkedMandis = Array.from(
        document.querySelectorAll('#new-mandi-list input[type="checkbox"]:checked')
      ).map(cb => parseInt(cb.value));
      payload.mandi_id  = checkedMandis[0] || null;
      payload.mandi_ids = checkedMandis;
      payload.permissions = getCheckedPerms('new-perms-grid');
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Adding…';
    const { ok, data } = await api('POST', '/api/users/add', payload);
    btn.disabled = false; btn.textContent = 'Add User';

    if (ok) {
      document.getElementById('user-add-form').reset();
      document.getElementById('um-add-card').style.display = 'none';
      showToast(`User "${username}" added`, 'success');
      loadUserManagement();
    } else {
      errDiv.textContent = data.error || 'Failed to add user';
      errDiv.classList.remove('hidden');
    }
  });

  // Edit modal close/cancel
  ['eu-close','eu-cancel'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      document.getElementById('edit-user-modal').classList.add('hidden');
    });
  });
  document.getElementById('edit-user-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('edit-user-modal'))
      document.getElementById('edit-user-modal').classList.add('hidden');
  });

  // Edit modal: reset password
  document.getElementById('eu-reset-pwd-btn')?.addEventListener('click', async () => {
    const userId  = document.getElementById('eu-user-id').value;
    const newPwd  = document.getElementById('eu-pwd-new').value;
    const confirm = document.getElementById('eu-pwd-confirm').value;
    const errDiv  = document.getElementById('eu-pwd-error');
    errDiv.classList.add('hidden');
    if (newPwd.length < 6) { errDiv.textContent = 'Password must be at least 6 characters'; errDiv.classList.remove('hidden'); return; }
    if (newPwd !== confirm) { errDiv.textContent = 'Passwords do not match'; errDiv.classList.remove('hidden'); return; }

    const btn = document.getElementById('eu-reset-pwd-btn');
    btn.disabled = true;
    const { ok, data } = await api('POST', `/api/users/${userId}/reset-password`, { new_password: newPwd, confirm_password: confirm });
    btn.disabled = false;
    if (ok) {
      document.getElementById('eu-pwd-new').value = '';
      document.getElementById('eu-pwd-confirm').value = '';
      showToast('Password reset', 'success');
    } else {
      errDiv.textContent = data.error || 'Failed to reset password';
      errDiv.classList.remove('hidden');
    }
  });

  // Edit modal: save (mandi assignments + permissions)
  document.getElementById('eu-save')?.addEventListener('click', async () => {
    const userId = document.getElementById('eu-user-id').value;
    const checkedMandis = Array.from(
      document.querySelectorAll('#eu-mandi-list input[name="eu-mandi"]:checked')
    ).map(cb => parseInt(cb.value));

    const payload = {
      mandi_id:  checkedMandis[0] || null,
      mandi_ids: checkedMandis,
      permissions: getCheckedPerms('eu-perms-grid'),
    };

    const btn = document.getElementById('eu-save');
    btn.disabled = true; btn.textContent = 'Saving…';
    const { ok, data } = await api('PUT', `/api/users/${userId}`, payload);
    btn.disabled = false; btn.textContent = 'Save Changes';

    if (ok) {
      document.getElementById('edit-user-modal').classList.add('hidden');
      showToast('User updated', 'success');
      loadUserManagement();
    } else {
      showToast(data.error || 'Failed to save', 'error');
    }
  });

  // Reset pwd modal (legacy, from inline reset pwd button in table)
  document.getElementById('rp-close')?.addEventListener('click', () => {
    document.getElementById('reset-pwd-modal').classList.add('hidden');
  });
  document.getElementById('reset-pwd-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('reset-pwd-modal'))
      document.getElementById('reset-pwd-modal').classList.add('hidden');
  });
  document.getElementById('reset-pwd-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId        = document.getElementById('rp-user-id').value;
    const new_password  = document.getElementById('rp-new').value;
    const confirm_password = document.getElementById('rp-confirm').value;
    const errDiv        = document.getElementById('rp-error');
    errDiv.classList.add('hidden');
    if (new_password.length < 6) { errDiv.textContent = 'Min 6 characters'; errDiv.classList.remove('hidden'); return; }
    if (new_password !== confirm_password) { errDiv.textContent = 'Passwords do not match'; errDiv.classList.remove('hidden'); return; }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    const { ok, data } = await api('POST', `/api/users/${userId}/reset-password`, { new_password, confirm_password });
    btn.disabled = false;
    if (ok) { showToast('Password reset', 'success'); document.getElementById('reset-pwd-modal').classList.add('hidden'); }
    else { errDiv.textContent = data.error || 'Failed'; errDiv.classList.remove('hidden'); }
  });
}

function setupAddFormForRole() {
  const level = document.getElementById('new-level')?.value;
  const isSuperAdmin = state.user?.level === 'superadmin';
  const mandiGroup  = document.getElementById('new-mandi-group');
  const adminNotice = document.getElementById('admin-mandi-notice');
  const permsSection = document.getElementById('new-perms-section');

  if (isSuperAdmin) {
    const showMandi = level !== 'superadmin';
    mandiGroup?.classList.toggle('hidden', !showMandi);
    adminNotice?.classList.add('hidden');
    permsSection?.classList.toggle('hidden', !showMandi);

    if (showMandi && mandiGroup) {
      const list = document.getElementById('new-mandi-list');
      list.innerHTML = umAllMandis.map(m => `
        <label class="mandi-assign-toggle">
          <input type="checkbox" name="new-mandi-cb" value="${m.id}">
          <span class="mandi-assign-badge">
            <span class="mandi-assign-prefix">${escapeHtml(m.prefix)}</span>
            ${escapeHtml(m.name)}
          </span>
        </label>`).join('');
      list.querySelectorAll('input[name="new-mandi-cb"]').forEach(cb => {
        cb.addEventListener('change', () => {
          cb.closest('label').querySelector('.mandi-assign-badge').classList.toggle('checked', cb.checked);
        });
      });
      buildPermsGrid('new-perms-grid', null, level);
    }
  } else {
    mandiGroup?.classList.add('hidden');
    adminNotice?.classList.remove('hidden');
    permsSection?.classList.add('hidden');
    const nameEl = document.getElementById('admin-mandi-notice-name');
    if (nameEl) nameEl.textContent = state.user?.mandi_name || 'your mandi';
  }

  // Add superadmin option if superadmin is viewing
  if (isSuperAdmin) {
    const sel = document.getElementById('new-level');
    if (sel && !sel.querySelector('option[value="superadmin"]')) {
      sel.insertAdjacentHTML('beforeend', '<option value="superadmin">Super Admin</option>');
    }
  }
}
