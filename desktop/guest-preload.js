// Runs inside every web page tab (top frame). Detects login form submits so
// DexBrowse can offer to save them, and fills saved logins when asked.
const { ipcRenderer } = require('electron');

const TEXTLIKE = ['text', 'email', 'tel', 'search', ''];
const isVisible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

function inputsIn(scope) {
  return [...scope.querySelectorAll('input')].filter((i) => !i.disabled && i.type !== 'hidden');
}

function usernameFieldFor(pw, requireValue) {
  const all = inputsIn(pw.form || document);
  const idx = all.indexOf(pw);
  for (let i = idx - 1; i >= 0; i--) {
    const type = (all[i].type || 'text').toLowerCase();
    if (TEXTLIKE.includes(type) && (!requireValue || all[i].value)) return all[i];
  }
  return null;
}

function capture(scope) {
  const root = scope && scope.querySelectorAll ? scope : document;
  const pw = [...root.querySelectorAll('input[type=password]')].find((p) => p.value);
  if (!pw) return;
  const user = usernameFieldFor(pw, true);
  ipcRenderer.sendToHost('login-submit', {
    origin: location.origin,
    username: user ? user.value : '',
    password: pw.value
  });
}

document.addEventListener('submit', (e) => capture(e.target), true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && e.target.type === 'password') capture(e.target.form || document);
}, true);
document.addEventListener('click', (e) => {
  const btn = e.target && e.target.closest && e.target.closest('button, input[type=submit], [role=button]');
  if (!btn) return;
  const form = btn.form || btn.closest('form');
  if (form || document.querySelector('input[type=password]')) capture(form || document);
}, true);

function setValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function fill(creds) {
  const pw = [...document.querySelectorAll('input[type=password]')].find((p) => !p.disabled && isVisible(p));
  if (!pw) return;
  const user = usernameFieldFor(pw, false);
  if (user && creds.username) setValue(user, creds.username);
  setValue(pw, creds.password);
}
ipcRenderer.on('login-fill', (_event, creds) => fill(creds));

let asked = false;
function maybeAsk() {
  if (asked || !document.querySelector('input[type=password]')) return;
  asked = true;
  ipcRenderer.sendToHost('login-request', { origin: location.origin });
}
let timer = null;
window.addEventListener('DOMContentLoaded', () => {
  maybeAsk();
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(maybeAsk, 400);
  }).observe(document.documentElement, { childList: true, subtree: true });
});
