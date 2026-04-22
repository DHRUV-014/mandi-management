/* Mandi Profile — load, save, and expose globally for prints */

async function loadMandiProfile() {
  const { ok, data } = await api('GET', '/api/profile');
  if (!ok) return;
  state.profile = data.profile;

  // Fill form if on profile page (admin only — superadmin has no mandi)
  const nameEl = document.getElementById('pf-name');
  if (nameEl && data.profile) {
    nameEl.value                                 = data.profile.name          || '';
    document.getElementById('pf-addr1').value    = data.profile.address_line1 || '';
    document.getElementById('pf-addr2').value    = data.profile.address_line2 || '';
    document.getElementById('pf-phone').value    = data.profile.phone         || '';
    document.getElementById('pf-license').value  = data.profile.license_no    || '';

    const maxGP  = data.current_max_gp;
    const maxEl  = document.getElementById('pf-gp-max');
    const nextEl = document.getElementById('pf-gp-next');
    if (maxEl) maxEl.textContent = maxGP || 'None yet';
    if (nextEl) {
      const gate   = getGateNumber();
      const now    = new Date();
      const yy     = String(now.getFullYear()).slice(-2);
      const prefix = state.user?.mandi_prefix || '??';
      nextEl.textContent = `${prefix}${gate}${yy}NNNNNN (gate ${gate}, next in sequence)`;
    }
    refreshDeviceSettingsDisplay();
  }
}

function getProfileHeader() {
  const p = state.profile || {};
  if (!p || !p.name) return '<h1 style="font-size:20px;color:#1a6b3a">MANDI MANAGEMENT SYSTEM</h1>';
  let html = `<h1 style="font-size:20px;font-weight:700;color:#1a6b3a;letter-spacing:0.5px">${escapeHtml(p.name)}</h1>`;
  if (p.address_line1) html += `<div style="font-size:11px;color:#555;margin-top:2px">${escapeHtml(p.address_line1)}</div>`;
  if (p.address_line2) html += `<div style="font-size:11px;color:#555">${escapeHtml(p.address_line2)}</div>`;
  const meta = [p.phone ? 'Ph: ' + p.phone : '', p.license_no ? 'Lic: ' + p.license_no : ''].filter(Boolean).join('  |  ');
  if (meta) html += `<div style="font-size:10px;color:#777;margin-top:2px">${escapeHtml(meta)}</div>`;
  return html;
}

function getProfileFooter() {
  const p    = state.profile || {};
  const name = p?.name || 'Mandi Management System';
  return `${escapeHtml(name)} &middot; ${new Date().toLocaleDateString('en-IN')}`;
}

function initProfileModule() {
  const fyBtn = document.getElementById('pf-fy-btn');
  if (fyBtn) fyBtn.addEventListener('click', () => {
    document.getElementById('fy-username').value = '';
    document.getElementById('fy-password').value = '';
    document.getElementById('fy-error').classList.add('hidden');
    document.getElementById('new-fy-modal').classList.remove('hidden');
    document.getElementById('fy-username').focus();
  });

  document.getElementById('fy-cancel').addEventListener('click', () => {
    document.getElementById('new-fy-modal').classList.add('hidden');
  });

  document.getElementById('new-fy-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errDiv   = document.getElementById('fy-error');
    errDiv.classList.add('hidden');

    const username = document.getElementById('fy-username').value.trim();
    const password = document.getElementById('fy-password').value;

    if (!username || !password) {
      errDiv.textContent = 'Admin credentials are required'; errDiv.classList.remove('hidden'); return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const authRes = await api('POST', '/api/auth/verify-admin', { username, password });
    if (!authRes.ok) {
      btn.disabled = false;
      errDiv.textContent = 'Invalid admin credentials'; errDiv.classList.remove('hidden'); return;
    }

    const mandiId = state.user?.mandi_id;
    if (!mandiId) {
      btn.disabled = false;
      errDiv.textContent = 'No mandi assigned to this account'; errDiv.classList.remove('hidden'); return;
    }

    const { ok } = await api('POST', `/api/mandis/${mandiId}/new-fy`);
    btn.disabled = false;
    if (ok) {
      document.getElementById('new-fy-modal').classList.add('hidden');
      await loadMandiProfile();
      showToast('New financial year started. Gate pass numbers will restart from 1.', 'success');
    } else {
      errDiv.textContent = 'Failed to create new financial year. Try again.'; errDiv.classList.remove('hidden');
    }
  });

  const profileForm = document.getElementById('profile-form');
  if (profileForm) profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errDiv = document.getElementById('pf-error');
    errDiv.classList.add('hidden');

    const name = document.getElementById('pf-name').value.trim();
    if (!name) {
      errDiv.textContent = 'Mandi name is required';
      errDiv.classList.remove('hidden');
      document.getElementById('pf-name').classList.add('error');
      return;
    }
    document.getElementById('pf-name').classList.remove('error');

    const btn = document.getElementById('pf-save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    const { ok, data } = await api('POST', '/api/profile', {
      name,
      address_line1: document.getElementById('pf-addr1').value.trim(),
      address_line2: document.getElementById('pf-addr2').value.trim(),
      phone:         document.getElementById('pf-phone').value.trim(),
      license_no:    document.getElementById('pf-license').value.trim(),
    });

    btn.disabled = false; btn.textContent = 'Save Profile';

    if (ok) {
      await loadMandiProfile();
      showToast('Profile saved successfully', 'success');
    } else {
      errDiv.textContent = data.error || 'Failed to save profile';
      errDiv.classList.remove('hidden');
    }
  });
}
