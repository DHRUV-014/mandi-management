/* ============================================================
   MANDI — Auth (session, login, logout, change password, RBUI)
   ============================================================ */

async function checkSession() {
  const { ok, data } = await api('GET', '/api/auth/me');
  if (ok) {
    state.user = data.user;
    showApp();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');

  // Always reset login button state when showing login page
  const btn = document.getElementById('login-btn');
  btn.disabled = false;
  btn.querySelector('span').textContent = 'Sign In';
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('login-error').textContent = '';
}

function showApp() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  updateHeaderUser();
  applyRoleBasedUI();
  navigateTo('dashboard');
}

function updateHeaderUser() {
  if (!state.user) return;
  document.getElementById('header-username').textContent = state.user.username;
  document.getElementById('header-level').textContent = state.user.level;
  document.getElementById('user-avatar').textContent = state.user.username.charAt(0).toUpperCase();
}

function applyRoleBasedUI() {
  const isAdmin = state.user && state.user.level === 'admin';

  document.getElementById('nav-user-management').classList.toggle('hidden', !isAdmin);

  document.getElementById('commodity-form-card').classList.toggle('hidden', !isAdmin);
  document.getElementById('commodity-readonly-notice').classList.toggle('hidden', isAdmin);
  document.getElementById('trader-form-card').classList.toggle('hidden', !isAdmin);
  document.getElementById('trader-readonly-notice').classList.toggle('hidden', isAdmin);
  document.getElementById('vehicle-form-card').classList.toggle('hidden', !isAdmin);
  document.getElementById('vehicle-readonly-notice').classList.toggle('hidden', isAdmin);
  document.getElementById('state-form-card').classList.toggle('hidden', !isAdmin);
  document.getElementById('state-readonly-notice').classList.toggle('hidden', isAdmin);

  document.querySelectorAll('.admin-only-th').forEach(th => th.classList.toggle('hidden', !isAdmin));
}

function initAuthModule() {
  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const errDiv = document.getElementById('login-error');
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    errDiv.classList.add('hidden');
    errDiv.textContent = '';
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Signing in…';

    const { ok, data } = await api('POST', '/api/auth/login', { username, password });

    if (ok) {
      state.user = data.user;
      showApp();
    } else {
      errDiv.textContent = data.error || 'Login failed';
      errDiv.classList.remove('hidden');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Sign In';
    }
  });

  // Header user dropdown
  document.getElementById('user-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('user-dropdown').classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    document.getElementById('user-dropdown').classList.add('hidden');
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('POST', '/api/auth/logout');
    state.user = null;
    document.getElementById('user-dropdown').classList.add('hidden');
    showLogin();
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
  });

  // Change own password
  document.getElementById('change-pwd-trigger').addEventListener('click', () => {
    document.getElementById('user-dropdown').classList.add('hidden');
    document.getElementById('cp-current').value = '';
    document.getElementById('cp-new').value = '';
    document.getElementById('cp-confirm').value = '';
    document.getElementById('cp-error').classList.add('hidden');
    document.getElementById('change-pwd-modal').classList.remove('hidden');
  });

  document.getElementById('cp-close').addEventListener('click', () => {
    document.getElementById('change-pwd-modal').classList.add('hidden');
  });
  document.getElementById('change-pwd-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('change-pwd-modal'))
      document.getElementById('change-pwd-modal').classList.add('hidden');
  });

  document.getElementById('change-pwd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const current_password = document.getElementById('cp-current').value;
    const new_password     = document.getElementById('cp-new').value;
    const confirm_password = document.getElementById('cp-confirm').value;
    const errDiv           = document.getElementById('cp-error');

    errDiv.classList.add('hidden');

    if (!current_password) { errDiv.textContent = 'Current password is required'; errDiv.classList.remove('hidden'); return; }
    if (new_password.length < 6) { errDiv.textContent = 'New password must be at least 6 characters'; errDiv.classList.remove('hidden'); return; }
    if (new_password !== confirm_password) { errDiv.textContent = 'New passwords do not match'; errDiv.classList.remove('hidden'); return; }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const { ok, data } = await api('POST', '/api/users/change-password', { current_password, new_password, confirm_password });
    btn.disabled = false;

    if (ok) {
      showToast('Password changed successfully', 'success');
      document.getElementById('change-pwd-modal').classList.add('hidden');
    } else {
      errDiv.textContent = data.error || 'Failed to change password';
      errDiv.classList.remove('hidden');
    }
  });
}
