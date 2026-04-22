/* Device-level settings — stored in localStorage, never sent to server */

function getGateNumber() {
  return Math.max(1, Math.min(9, parseInt(localStorage.getItem('mandi_gate_number')) || 1));
}

function setGateNumber(n) {
  localStorage.setItem('mandi_gate_number', String(Math.max(1, Math.min(9, parseInt(n) || 1))));
}

function isDeviceConfigured() {
  return localStorage.getItem('mandi_gate_configured') === 'true';
}

function markDeviceConfigured() {
  localStorage.setItem('mandi_gate_configured', 'true');
}

// Show first-time setup modal (called after login when device is not configured)
function checkDeviceSetup() {
  if (!isDeviceConfigured()) {
    document.getElementById('ds-gate-number').value = '';
    document.getElementById('ds-error').classList.add('hidden');

    // Show mandi name in the modal if available
    const mandiInfo = document.getElementById('ds-mandi-info');
    if (mandiInfo && state.user?.mandi_name) {
      mandiInfo.textContent = `Mandi: ${state.user.mandi_name}`;
      mandiInfo.style.display = '';
    } else if (mandiInfo) {
      mandiInfo.style.display = 'none';
    }

    document.getElementById('device-setup-modal').classList.remove('hidden');
    document.getElementById('ds-gate-number').focus();
  }
}

// Refresh the device settings display in the Mandi Profile page
function refreshDeviceSettingsDisplay() {
  const el = document.getElementById('ds-current-gate');
  if (el) el.textContent = getGateNumber();

  const inp = document.getElementById('ds-edit-gate');
  if (inp) inp.value = getGateNumber();
}

function initDeviceSetupModule() {
  // First-time setup: Save button
  document.getElementById('ds-save-btn').addEventListener('click', () => {
    const raw  = document.getElementById('ds-gate-number').value.trim();
    const gate = parseInt(raw);
    const err  = document.getElementById('ds-error');

    if (!gate || gate < 1 || gate > 9) {
      err.textContent = 'Gate number must be between 1 and 9';
      err.classList.remove('hidden');
      return;
    }

    setGateNumber(gate);
    markDeviceConfigured();
    document.getElementById('device-setup-modal').classList.add('hidden');
    showToast(`This device is now configured as Gate ${gate}`, 'success');
    refreshDeviceSettingsDisplay();
    if (state.currentPage === 'gate-pass') loadGatePassPage();
  });

  // Enter key in gate input
  document.getElementById('ds-gate-number').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('ds-save-btn').click();
  });

  // Settings card: Change button (admin only)
  const changeBtn = document.getElementById('ds-change-btn');
  if (changeBtn) {
    changeBtn.addEventListener('click', () => {
      document.getElementById('ds-settings-view').classList.add('hidden');
      document.getElementById('ds-settings-edit').classList.remove('hidden');
      document.getElementById('ds-edit-gate').value = getGateNumber();
      document.getElementById('ds-edit-gate').focus();
    });

    document.getElementById('ds-edit-cancel').addEventListener('click', () => {
      document.getElementById('ds-settings-view').classList.remove('hidden');
      document.getElementById('ds-settings-edit').classList.add('hidden');
    });

    document.getElementById('ds-edit-save').addEventListener('click', () => {
      const raw  = document.getElementById('ds-edit-gate').value.trim();
      const gate = parseInt(raw);
      const err  = document.getElementById('ds-edit-error');

      if (!gate || gate < 1 || gate > 9) {
        err.textContent = 'Gate number must be between 1 and 9';
        err.classList.remove('hidden');
        return;
      }
      err.classList.add('hidden');
      setGateNumber(gate);
      markDeviceConfigured();
      document.getElementById('ds-settings-view').classList.remove('hidden');
      document.getElementById('ds-settings-edit').classList.add('hidden');
      refreshDeviceSettingsDisplay();
      showToast(`Gate number updated to ${gate}`, 'success');
      if (state.currentPage === 'gate-pass') loadGatePassPage();
    });
  }
}
