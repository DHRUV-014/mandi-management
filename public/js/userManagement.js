/* ============================================================
   MANDI — User Management (admin only + reset password modal)
   ============================================================ */

async function loadUserManagement() {
  const { ok, data } = await api('GET', '/api/users/all');
  if (!ok) {
    if (data.error === 'Access denied') showToast('Access denied', 'error');
    else showToast('Failed to load users', 'error');
    return;
  }
  renderUserTable(data);
}

function renderUserTable(users) {
  const tbody = document.getElementById('user-tbody');
  const countBadge = document.getElementById('user-count');
  countBadge.textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`;

  if (users.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No users found</td></tr>';
    return;
  }

  tbody.innerHTML = users.map((u, i) => {
    const isSelf = u.id === state.user.id;
    const levelBadge = u.level === 'admin'
      ? `<span class="level-badge level-admin">Administrator</span>`
      : `<span class="level-badge level-user">User</span>`;
    return `
      <tr data-id="${u.id}">
        <td>${i + 1}</td>
        <td>
          ${escapeHtml(u.username)}
          ${isSelf ? '<span class="self-badge">you</span>' : ''}
        </td>
        <td>${levelBadge}</td>
        <td style="font-size:12px;color:var(--text-muted)">${u.created_at ? u.created_at.split('T')[0] : '—'}</td>
        <td class="actions-cell">
          <button class="btn btn-icon edit" onclick="openResetPwd(${u.id}, '${escapeHtml(u.username)}')" title="Reset password">&#128273;</button>
          ${!isSelf ? `<button class="btn btn-icon delete" onclick="deleteUser(${u.id}, '${escapeHtml(u.username)}')" title="Delete user">&#128465;</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

async function deleteUser(id, username) {
  const confirmed = await showConfirm(`Delete user "${username}"? This cannot be undone.`);
  if (!confirmed) return;

  const { ok, data } = await api('DELETE', `/api/users/${id}`);
  if (ok) {
    showToast(`User "${username}" deleted`, 'success');
    loadUserManagement();
  } else {
    showToast(data.error || 'Failed to delete user', 'error');
  }
}

function openResetPwd(userId, username) {
  document.getElementById('rp-user-id').value = userId;
  document.getElementById('rp-label').textContent = `Set a new password for: ${username}`;
  document.getElementById('rp-new').value = '';
  document.getElementById('rp-confirm').value = '';
  document.getElementById('rp-error').classList.add('hidden');
  document.getElementById('reset-pwd-modal').classList.remove('hidden');
}

function initUserManagementModule() {
  document.getElementById('user-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const usernameInput = document.getElementById('new-username');
    const passwordInput = document.getElementById('new-password');
    const levelSelect   = document.getElementById('new-level');

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const level    = levelSelect.value;

    [usernameInput, passwordInput].forEach(el => el.classList.remove('error'));

    if (!username) { usernameInput.classList.add('error'); showToast('Username is required', 'error'); return; }
    if (password.length < 6) { passwordInput.classList.add('error'); showToast('Password must be at least 6 characters', 'error'); return; }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const { ok, data } = await api('POST', '/api/users/add', { username, password, level });
    btn.disabled = false;

    if (ok) {
      showToast(`User "${username}" added successfully`, 'success');
      e.target.reset();
      loadUserManagement();
    } else {
      showToast(data.error || 'Failed to add user', 'error');
      if (data.error && data.error.toLowerCase().includes('username')) usernameInput.classList.add('error');
    }
  });

  // Reset password modal (admin)
  document.getElementById('rp-close').addEventListener('click', () => {
    document.getElementById('reset-pwd-modal').classList.add('hidden');
  });
  document.getElementById('reset-pwd-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('reset-pwd-modal'))
      document.getElementById('reset-pwd-modal').classList.add('hidden');
  });

  document.getElementById('reset-pwd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId      = document.getElementById('rp-user-id').value;
    const new_password     = document.getElementById('rp-new').value;
    const confirm_password = document.getElementById('rp-confirm').value;
    const errDiv      = document.getElementById('rp-error');

    errDiv.classList.add('hidden');

    if (new_password.length < 6) { errDiv.textContent = 'Password must be at least 6 characters'; errDiv.classList.remove('hidden'); return; }
    if (new_password !== confirm_password) { errDiv.textContent = 'Passwords do not match'; errDiv.classList.remove('hidden'); return; }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const { ok, data } = await api('POST', `/api/users/${userId}/reset-password`, { new_password, confirm_password });
    btn.disabled = false;

    if (ok) {
      showToast('Password reset successfully', 'success');
      document.getElementById('reset-pwd-modal').classList.add('hidden');
    } else {
      errDiv.textContent = data.error || 'Failed to reset password';
      errDiv.classList.remove('hidden');
    }
  });
}
