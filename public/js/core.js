/* ============================================================
   MANDI — Core utilities (state, api, toast, confirm, escape)
   ============================================================ */

const state = {
  user: null,
  currentPage: 'dashboard',
};

async function api(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✔', error: '✖', info: 'ℹ' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);

  toast.addEventListener('click', () => removeToast(toast));

  setTimeout(() => removeToast(toast), 4000);
}

function removeToast(toast) {
  if (toast.classList.contains('removing')) return;
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 300);
}

function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    document.getElementById('confirm-message').textContent = message;

    titleEl.textContent = options.title || 'Confirm Delete';
    const yes = document.getElementById('confirm-yes');
    yes.textContent = options.confirmText || 'Delete';
    yes.className = options.btnClass || 'btn btn-danger';

    const no = document.getElementById('confirm-no');
    modal.classList.remove('hidden');

    const cleanup = (result) => {
      modal.classList.add('hidden');
      yes.replaceWith(yes.cloneNode(true));
      no.replaceWith(no.cloneNode(true));
      resolve(result);
    };

    document.getElementById('confirm-yes').addEventListener('click', () => cleanup(true));
    document.getElementById('confirm-no').addEventListener('click', () => cleanup(false));
    modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(false); }, { once: true });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function openPrintWindow(html, triggerPrint) {
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) {
    showToast('Pop-up blocked! Please allow pop-ups for this site.', 'error');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    if (triggerPrint) {
      win.print();
    }
  };
}
