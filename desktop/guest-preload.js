// Runs inside every web page tab (top frame). Detects login form submits so
// DexBrowse can offer to save them, and fills saved logins when asked.
const { ipcRenderer, webFrame } = require('electron');

// ---- page-world shims (run before the page's own scripts) ----
// 1) Notifications: this engine reports "granted" for everything, so a site could show notifications
//    without asking. Pages see "default" until you answer, and the prompt appears when they ask.
try {
  const state = ipcRenderer.sendSync('perm:state', location.origin);
  webFrame.executeJavaScript(`(() => {
    const N = window.Notification;
    if (!N) return;
    let st = ${JSON.stringify(state)};
    const ask = N.requestPermission.bind(N);
    Object.defineProperty(N, 'permission', { get: () => st, configurable: true });
    N.requestPermission = function (cb) {
      return ask().then((r) => { st = r; if (typeof cb === 'function') { try { cb(r); } catch (e) {} } return r; });
    };
    const q = navigator.permissions && navigator.permissions.query.bind(navigator.permissions);
    if (q) navigator.permissions.query = (d) => (d && d.name === 'notifications'
      ? Promise.resolve({ name: 'notifications', state: st === 'default' ? 'prompt' : st, onchange: null, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
      : q(d));
  })();`).catch(() => {});
} catch (_) { /* ignore */ }

// 2) Embedded Chromium has an empty window.chrome; a real Chrome page has app, csi and loadTimes.
//    Google's sign-in checks for this, so give pages the same objects Chrome does.
webFrame.executeJavaScript(`(() => {
    // A real Chrome page has these; an embedded Chromium has an empty window.chrome, which Google treats as "not a browser".
    const w = window;
    if (!w.chrome) w.chrome = {};
    const c = w.chrome;
    const nat = (fn, name) => { try { Object.defineProperty(fn, 'name', { value: name }); fn.toString = () => 'function ' + name + '() { [native code] }'; } catch (e) {} return fn; };
    if (!c.app) c.app = {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      getDetails: nat(function () { return null; }, 'getDetails'),
      getIsInstalled: nat(function () { return false; }, 'getIsInstalled'),
      installState: nat(function (cb) { if (typeof cb === 'function') cb('not_installed'); }, 'installState'),
      runningState: nat(function () { return 'cannot_run'; }, 'runningState')
    };
    if (!c.csi) c.csi = nat(function () {
      const t = performance.timing;
      return { onloadT: t.domContentLoadedEventEnd, startE: t.navigationStart, pageT: Date.now() - t.navigationStart, tran: 15 };
    }, 'csi');
    if (!c.loadTimes) c.loadTimes = nat(function () {
      const t = performance.timing;
      return {
        requestTime: t.navigationStart / 1000, startLoadTime: t.navigationStart / 1000, commitLoadTime: t.responseStart / 1000,
        finishDocumentLoadTime: t.domContentLoadedEventEnd / 1000, finishLoadTime: t.loadEventEnd / 1000,
        firstPaintTime: t.responseEnd / 1000, firstPaintAfterLoadTime: 0, navigationType: 'Other',
        wasFetchedViaSpdy: true, wasNpnNegotiated: true, npnNegotiatedProtocol: 'h2', wasAlternateProtocolAvailable: false, connectionInfo: 'h2'
      };
    }, 'loadTimes');
})();`).catch(() => {});

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
ipcRenderer.on('login-fill', (_event, creds) => { hideSuggest(); fill(creds); });

// ---- account suggestions: several saved accounts for one site ----
let accounts = [];
let box = null;
function hideSuggest() { if (box) { box.remove(); box = null; } }
function strongPassword() {
  const sets = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%^&*-_?'];
  const all = sets.join('');
  const rnd = (n) => { const a = new Uint32Array(1); let x; do { crypto.getRandomValues(a); x = a[0]; } while (x >= 4294967296 - (4294967296 % n)); return x % n; };
  const out = sets.map((s) => s[rnd(s.length)]);
  while (out.length < 18) out.push(all[rnd(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}
// a new-password field: marked as such by the page, or a form with two password fields (sign-up / change password)
function isNewPasswordField(pw) {
  if (/new-password/i.test(pw.autocomplete || '')) return true;
  const scope = pw.form || document;
  return [...scope.querySelectorAll('input[type=password]')].filter((p) => !p.disabled && isVisible(p)).length >= 2;
}
function showSuggest(input, offerNew) {
  hideSuggest();
  if (!accounts.length && !offerNew) return;
  const r = input.getBoundingClientRect();
  box = document.createElement('div');
  const root = box.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = '.b{font:13px system-ui,sans-serif;background:#fff;color:#111;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.25);overflow:hidden}'
    + '.h{padding:6px 10px;font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0}'
    + 'button{display:block;width:100%;text-align:left;padding:8px 10px;border:0;background:#fff;color:#111;font:inherit;cursor:pointer}button:hover{background:#eef2ff}';
  const inner = document.createElement('div');
  inner.className = 'b';
  const head = document.createElement('div');
  head.className = 'h';
  head.textContent = 'DexBrowse passwords';
  inner.append(head);
  if (offerNew) {
    const gen = strongPassword();
    const b = document.createElement('button');
    b.innerHTML = '<b>Use a strong password</b><br><span style="font:12px monospace;color:#475569"></span>';
    b.querySelector('span').textContent = gen;
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const scope = input.form || document;
      for (const p of scope.querySelectorAll('input[type=password]')) if (!p.disabled && isVisible(p)) setValue(p, gen);
      hideSuggest();
    });
    inner.append(b);
  }
  for (const a of accounts) {
    const b = document.createElement('button');
    b.textContent = a.username || '(no username)';
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      ipcRenderer.sendToHost('login-pick', { origin: location.origin, id: a.id });
      hideSuggest();
    });
    inner.append(b);
  }
  const manage = document.createElement('button');
  manage.textContent = 'Manage passwords…';
  manage.style.cssText = 'color:#4f46e5;border-top:1px solid #e2e8f0';
  manage.addEventListener('mousedown', (e) => { e.preventDefault(); ipcRenderer.sendToHost('login-manage', { origin: location.origin }); hideSuggest(); });
  inner.append(manage);
  root.append(style, inner);
  Object.assign(box.style, { position: 'fixed', zIndex: 2147483647, left: Math.max(0, r.left) + 'px', top: r.bottom + 2 + 'px', minWidth: Math.max(r.width, 220) + 'px' });
  document.documentElement.append(box);
}
ipcRenderer.on('login-accounts', (_event, list) => { accounts = list || []; });
document.addEventListener('focusin', (e) => {
  const t = e.target;
  if (!t || t.tagName !== 'INPUT') return;
  const type = (t.type || 'text').toLowerCase();
  const pw = type === 'password' ? t : null;
  if (pw && isVisible(pw) && isNewPasswordField(pw)) { showSuggest(pw, true); return; }
  if (!accounts.length) return;
  const user = pw ? null : (TEXTLIKE.includes(type) ? t : null);
  if (pw) { if (isVisible(pw)) showSuggest(pw); return; }
  if (user) {
    const scope = user.form || document;
    const hasPw = [...scope.querySelectorAll('input[type=password]')].some((p) => !p.disabled);
    if (hasPw) showSuggest(user);
  }
}, true);
document.addEventListener('focusout', () => setTimeout(hideSuggest, 120), true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideSuggest(); }, true);
window.addEventListener('scroll', hideSuggest, true);

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
