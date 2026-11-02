'use strict';

const $ = (id) => document.getElementById(id);
const PRIV = new URLSearchParams(location.search).get('private') === '1';
const PARTITION = PRIV ? 'private' : 'persist:browse';
const START_BASE = new URL('start.html', location.href).href;

const ICONS = {
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M14 10h4M14 14h3M6 16c.6-1.5 1.7-2 3-2s2.4.5 3 2"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  forward: '<path d="M9 6l6 6-6 6"/>',
  reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  up: '<path d="M18 15l-6-6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9c1.5 1.5 1.5 4.5 0 6"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l4 6M21 9l-4 6"/>',
  puzzle: '<path d="M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4h2a2 2 0 1 0 0-4H6V6h4z"/>'
};
const svg = (name) => `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`;

const tabs = [];
const closed = [];
const pendingBlocked = new Map();
const dlCache = new Map();
let active = null;
let seq = 0;
let cfg = null;
let sync = { configured: false, signedIn: false, email: '' };
let bookmarks = [];
let bmFolders = [];
let panelKind = null;
let libTab = 'history';
let pendingSave = null;
let settingsOpen = false;
let lockEnabled = false;
let googleBlockedUrl = '';
let split = null; // { a, b, ratio } two tabs shown side by side

// ---------- helpers ----------
function el(tag, props, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props || {});
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
function iconEl(name, cls) {
  const span = el('span', { className: cls || 'ico' });
  span.innerHTML = svg(name);
  return span;
}
function setIconEl(node, name) { node.insertAdjacentHTML('afterbegin', svg(name)); }
function setIcon(id, name) {
  $(id).insertAdjacentHTML('afterbegin', svg(name));
}

let toastTimer = null;
function toast(message) {
  const box = $('toast');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 3500);
}

const engineUrl = () => cfg.engines[cfg.settings.engine];
const hostOf = (url) => { try { return new URL(url).host || url; } catch (_) { return url; } };
const isStart = (url) => typeof url === 'string' && url.startsWith(START_BASE);
const isWeb = (url) => /^https?:\/\//i.test(url || '');

function when(ts) {
  return new Date(ts).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function size(bytes) {
  if (!bytes) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < 3) { bytes /= 1024; i++; }
  return `${bytes.toFixed(i ? 1 : 0)} ${u[i]}`;
}
function effectiveTheme() {
  const t = cfg.settings.theme;
  if (t === 'system') return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return t;
}
function applyTheme() {
  document.documentElement.dataset.theme = effectiveTheme();
}

function toUrl(text) {
  text = text.trim();
  if (!text) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^(about|data|view-source):/i.test(text)) return text;
  if (/^localhost(:\d+)?([/?#]|$)/i.test(text) || /^(\d{1,3}\.){3}\d{1,3}(:\d+)?([/?#]|$)/.test(text)) return 'http://' + text;
  if (!/\s/.test(text) && /^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(text)) return 'https://' + text;
  return engineUrl() + encodeURIComponent(text);
}

async function buildStartUrl() {
  const stats = (await dex.shieldsStats()).data || {};
  let tiles = [];
  if (!PRIV) {
    const res = await dex.historyList();
    if (res.ok) {
      const seen = new Set();
      for (const v of res.data) {
        try {
          const origin = new URL(v.url).origin;
          if (!seen.has(origin)) { seen.add(origin); tiles.push({ title: new URL(v.url).hostname.replace(/^www\./, ''), url: origin }); }
        } catch (_) { /* skip */ }
        if (tiles.length >= 8) break;
      }
    }
  }
  const q = new URLSearchParams({
    e: engineUrl(), n: cfg.settings.engine, t: effectiveTheme(),
    ads: stats.ads || 0, trk: stats.trackers || 0, up: stats.upgrades || 0,
    p: PRIV ? '1' : '0', tiles: JSON.stringify(tiles)
  });
  return START_BASE + '?' + q.toString();
}

async function homeUrl() {
  const s = cfg.settings;
  if (s.startup === 'homepage' && s.homepage) return toUrl(s.homepage);
  return buildStartUrl();
}

// ---------- tabs ----------
// Google refuses some embedded browsers: when its error page shows, offer the default browser.
function checkGoogleBlock(tab) {
  let host = '';
  try { host = new URL(tab.url).hostname; } catch (_) { return; }
  if (!/^accounts\.(google|youtube)\.com$/.test(host) || !tab.view) return;
  const test = () => {
    if (!tab.view || !tab.ready) return;
    tab.view.executeJavaScript('document.body ? document.body.innerText : ""').then((t) => {
      if (/may not be secure|Couldn.t sign you in/i.test(String(t)) && tab === active) { googleBlockedUrl = tab.url; $('gbar').hidden = false; }
    }).catch(() => {});
  };
  test();
  setTimeout(test, 1500);
}

function buildView(tab) {
  const view = document.createElement('webview');
  view.setAttribute('partition', PARTITION);
  view.setAttribute('allowpopups', '');
  view.setAttribute('plugins', '');
  view.setAttribute('preload', cfg.guestPreload);

  view.addEventListener('focus', () => { if (split && inSplit(tab) && tab !== active) activateTab(tab); });
  view.addEventListener('dom-ready', () => {
    tab.ready = true;
    try {
      tab.wcId = view.getWebContentsId();
      if (pendingBlocked.has(tab.wcId)) tab.blocked = pendingBlocked.get(tab.wcId);
      if (tab.muted) view.setAudioMuted(true);
      if (tab.zoom) view.setZoomLevel(tab.zoom);
    } catch (_) { /* ignore */ }
    if (tab === active) updateToolbar();
  });
  view.addEventListener('page-title-updated', (e) => { tab.title = e.title || tab.title; renderTabs(); });
  view.addEventListener('page-favicon-updated', (e) => { tab.favicon = (e.favicons && e.favicons[0]) || ''; renderTabs(); });
  view.addEventListener('did-start-loading', () => { tab.loading = true; if (tab === active) updateToolbar(); renderTabs(); });
  view.addEventListener('did-stop-loading', () => {
    tab.loading = false;
    checkGoogleBlock(tab);
    recordVisit(tab);
    if (tab === active) updateToolbar();
    renderTabs();
  });
  view.addEventListener('did-start-navigation', (e) => {
    if (e.isMainFrame && !e.isInPlace) { tab.blocked = 0; if (tab === active) updateShieldBadge(); }
  });
  view.addEventListener('did-navigate', (e) => onNavigate(tab, e.url));
  view.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) onNavigate(tab, e.url); });
  view.addEventListener('did-fail-load', (e) => {
    if (!e.isMainFrame || e.errorCode === -3) return;
    const page = '<body style="font-family:system-ui;background:#17181F;color:#EDEEF2;text-align:center;padding-top:15vh">' +
      '<h2>This site can’t be reached</h2><p style="color:#9DA0AE">Check the address and your internet connection.</p></body>';
    tab.failedUrl = e.validatedURL;
    view.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page));
  });
  view.addEventListener('found-in-page', (e) => {
    if (tab !== active) return;
    const r = e.result;
    $('findcount').textContent = r.matches ? `${r.activeMatchOrdinal}/${r.matches}` : '0/0';
  });
  view.addEventListener('media-started-playing', () => { tab.audible = true; renderTabs(); });
  view.addEventListener('media-paused', () => { tab.audible = false; renderTabs(); });
  view.addEventListener('focus', closePops);
  view.addEventListener('enter-html-full-screen', () => document.body.classList.add('fs'));
  view.addEventListener('leave-html-full-screen', () => document.body.classList.remove('fs'));
  view.addEventListener('ipc-message', (e) => onGuestMessage(tab, e));

  return view;
}

function createTab(url, activate = true, opts = {}) {
  const startPage = !url || url === 'dex://start';
  const tab = {
    id: ++seq, view: null, lastActive: Date.now(), sleeping: false, title: 'New tab', url: startPage ? START_BASE : url, loading: false, favicon: '',
    ready: false, recorded: '', zoom: 0, pinned: !!opts.pinned, audible: false, muted: false,
    blocked: 0, wcId: null, failedUrl: null
  };
  if (tab.pinned) tabs.splice(tabs.filter((t) => t.pinned).length, 0, tab);
  else tabs.push(tab);

  const view = buildView(tab);
  tab.view = view;
  $('views').append(view);
  if (startPage) buildStartUrl().then((u) => view.setAttribute('src', u));
  else view.setAttribute('src', url);
  if (activate) activateTab(tab);
  else renderTabs();
  scheduleSessionSave();
  return tab;
}

// ---------- memory saver: tabs you have not used for a while are put to sleep ----------
function sleepTab(tab, force) {
  if (tab.sleeping || !tab.view) return;
  if (!force && (tab === active || inSplit(tab) || tab.pinned || tab.audible || tab.loading || !tab.ready)) return;
  tab.sleeping = true;
  tab.sleepUrl = tab.failedUrl || tab.url;
  tab.view.remove();
  tab.view = null;
  tab.ready = false;
  tab.wcId = null;
  renderTabs();
}
function wakeTab(tab) {
  if (!tab.sleeping) return;
  tab.sleeping = false;
  tab.view = buildView(tab);
  $('views').append(tab.view);
  tab.view.setAttribute('src', tab.sleepUrl || tab.url);
  if (split) applyLayout();
}
setInterval(() => {
  if (!cfg || !cfg.settings.memorySaver) return;
  const limit = cfg.settings.sleepMinutes * 60000;
  for (const t of tabs) if (t !== active && Date.now() - t.lastActive > limit) sleepTab(t);
}, 30000);

function navigateTab(tab, url) {
  wakeTab(tab);
  if (tab.ready) tab.view.loadURL(url).catch(() => {});
  else tab.view.setAttribute('src', url);
}

function onNavigate(tab, url) {
  if (url.startsWith('data:')) return;
  tab.url = url;
  tab.failedUrl = null;
  if (isStart(url)) tab.title = 'New tab';
  if (tab === active) { updateToolbar(); if (!/accounts\.(google|youtube)\.com/.test(url)) $('gbar').hidden = true; }
  scheduleSessionSave();
}

function recordVisit(tab) {
  if (PRIV || !isWeb(tab.url) || tab.recorded === tab.url) return;
  tab.recorded = tab.url;
  dex.historyAdd({ url: tab.url, title: tab.title });
}

// ---------- split view: two tabs side by side ----------
const inSplit = (t) => !!split && (t === split.a || t === split.b);
function applyLayout() {
  const bar = $('splitbar');
  for (const t of tabs) {
    if (!t.view) continue;
    t.view.style.left = t.view.style.width = t.view.style.right = '';
    t.view.classList.remove('splitfocus');
    t.view.classList.toggle('active', t === active && !inSplit(t));
  }
  const showing = split && active && inSplit(active) && !settingsOpen;
  bar.hidden = !showing;
  if (!showing) return;
  wakeTab(split.a);
  wakeTab(split.b);
  const pct = split.ratio * 100;
  split.a.view.classList.add('active', 'splitfocus');
  split.b.view.classList.add('active', 'splitfocus');
  split.a.view.style.left = '0';
  split.a.view.style.width = `calc(${pct}% - 3px)`;
  split.b.view.style.left = `calc(${pct}% + 3px)`;
  split.b.view.style.width = `calc(${100 - pct}% - 3px)`;
  split.a.view.classList.toggle('paneon', active === split.a);
  split.b.view.classList.toggle('paneon', active === split.b);
  bar.style.left = `calc(${pct}% - 3px)`;
}
function startSplit(tab) {
  if (inSplit(tab)) return;
  let partner = tabs.filter((t) => t !== tab && !t.pinned && !inSplit(t)).sort((x, y) => y.lastActive - x.lastActive)[0];
  if (!partner) partner = createTab(undefined, false);
  split = { a: tab, b: partner, ratio: 0.5 };
  activateTab(tab);
  toast('Split view: click a side to work in it. Drag the divider to resize.');
}
function endSplit() {
  split = null;
  applyLayout();
  renderTabs();
}
function swapSplit() {
  if (!split) return;
  [split.a, split.b] = [split.b, split.a];
  applyLayout();
}
(function initSplitBar() {
  const bar = $('splitbar');
  bar.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    const box = $('views').getBoundingClientRect();
    const shield = el('div', { className: 'splitshield' });
    $('views').append(shield); // keeps the pages from swallowing the mouse while dragging
    const move = (ev) => { split.ratio = Math.min(0.8, Math.max(0.2, (ev.clientX - box.left) / box.width)); applyLayout(); };
    const up = () => { shield.remove(); document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
  $('splitswap').addEventListener('click', swapSplit);
  $('splitclose').addEventListener('click', endSplit);
})();

function activateTab(tab) {
  closeSettings();
  if (active && active !== tab) active.lastActive = Date.now();
  tab.lastActive = Date.now();
  wakeTab(tab);
  active = tab;
  applyLayout();
  renderTabs();
  updateToolbar();
  $('findcount').textContent = '';
  if (isStart(tab.url) && !panelKind) $('address').focus();
}

function closeTab(tab) {
  const index = tabs.indexOf(tab);
  if (index < 0) return;
  if (isWeb(tab.url)) closed.push(tab.url);
  if (inSplit(tab)) split = null;
  tabs.splice(index, 1);
  if (tab.view) tab.view.remove();
  if (!tabs.length) { dex.windowClose(); return; } // closing the last tab closes the window, like Chrome and Brave
  if (active === tab) activateTab(tabs[Math.min(index, tabs.length - 1)]);
  else { applyLayout(); renderTabs(); }
  scheduleSessionSave();
}

function togglePin(tab) {
  tab.pinned = !tab.pinned;
  tabs.splice(tabs.indexOf(tab), 1);
  const pinnedCount = tabs.filter((t) => t.pinned).length;
  tabs.splice(pinnedCount, 0, tab);
  renderTabs();
}

function renderTabs() {
  const strip = $('tabs');
  strip.replaceChildren();
  for (const tab of tabs) {
    const node = el('div', { className: 'tab' + (tab === active && !settingsOpen ? ' active' : '') + (tab.pinned ? ' pinned' : '') + (tab.sleeping ? ' sleeping' : '') + (inSplit(tab) ? ' insplit' : ''), title: tab.title + (tab.sleeping ? ' (sleeping to save memory)' : '') });
    if (tab.loading) node.append(el('span', { className: 'spin' }));
    else if (tab.favicon) node.append(el('img', { src: tab.favicon, alt: '' }));
    else if (isStart(tab.url)) node.append(el('img', { src: 'icon.png', alt: '' }));
    else node.append(el('span', { className: 'fav' }, (hostOf(tab.url).replace(/^www\./, '')[0] || 'D').toUpperCase()));
    if (!tab.pinned) node.append(el('span', { className: 't' }, tab.title));
    if (tab.audible || tab.muted) {
      const snd = el('button', { className: 'snd', title: tab.muted ? 'Unmute tab' : 'Mute tab' });
      snd.innerHTML = svg(tab.muted ? 'mute' : 'sound');
      snd.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(tab); });
      node.append(snd);
    }
    if (!tab.pinned) {
      const close = el('button', { className: 'x', title: 'Close tab' });
      close.innerHTML = svg('close');
      close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab); });
      node.append(close);
    }
    node.addEventListener('click', () => activateTab(tab));
    node.addEventListener('auxclick', (e) => { if (e.button === 1 && !tab.pinned) closeTab(tab); });
    node.addEventListener('contextmenu', (e) => { e.preventDefault(); showTabMenu(tab, e.clientX, e.clientY); });
    strip.append(node);
  }
  if (settingsOpen) {
    const node = el('div', { className: 'tab settings-tab active', title: 'Settings' },
      el('img', { src: 'icon.png', alt: '' }), el('span', { className: 't' }, 'Settings'));
    const close = el('button', { className: 'x', title: 'Close settings' });
    close.innerHTML = svg('close');
    close.addEventListener('click', (e) => { e.stopPropagation(); closeSettings(); });
    node.append(close);
    strip.append(node);
  }
  document.title = settingsOpen ? 'Settings – DexBrowse' : active ? `${active.title} – DexBrowse` : 'DexBrowse By Fuad';
}

function toggleMute(tab) {
  tab.muted = !tab.muted;
  if (tab.ready) tab.view.setAudioMuted(tab.muted);
  renderTabs();
}

function showTabMenu(tab, x, y) {
  closePops();
  const box = $('ctx');
  box.replaceChildren();
  const add = (label, fn) => box.append(el('button', { onclick: () => { closePops(); fn(); } }, label));
  add('Reload', () => tab.ready && tab.view.reload());
  add('Duplicate', () => createTab(isStart(tab.url) ? 'dex://start' : tab.url));
  if (inSplit(tab)) { add('Exit split view', endSplit); add('Swap split sides', swapSplit); }
  else if (!tab.pinned) add('Split view', () => startSplit(tab));
  add(tab.pinned ? 'Unpin tab' : 'Pin tab', () => togglePin(tab));
  add(tab.muted ? 'Unmute site' : 'Mute site', () => toggleMute(tab));
  box.append(el('hr'));
  if (!tab.pinned) add('Close tab', () => closeTab(tab));
  add('Close other tabs', () => { for (const t of [...tabs]) if (t !== tab && !t.pinned) closeTab(t); });
  box.style.left = Math.min(x, innerWidth - 200) + 'px';
  box.style.top = Math.min(y, innerHeight - 220) + 'px';
  box.hidden = false;
}

function updateShieldBadge() {
  const badge = $('shieldcount');
  const n = active ? active.blocked : 0;
  badge.hidden = !(n > 0);
  badge.textContent = n > 99 ? '99+' : String(n);
}

function updateToolbar() {
  if (!active) return;
  const v = active.view;
  const shown = active.failedUrl || active.url;
  if (document.activeElement !== $('address')) $('address').value = isStart(shown) ? '' : shown;
  $('back').disabled = !(active.ready && v.canGoBack());
  $('forward').disabled = !(active.ready && v.canGoForward());
  $('reload').replaceChildren();
  $('reload').insertAdjacentHTML('afterbegin', svg(active.loading ? 'close' : 'reload'));
  $('progress').classList.toggle('on', active.loading);
  $('star').classList.toggle('on', bookmarks.some((b) => b.url === active.url));
  const siteicon = $('siteicon');
  siteicon.replaceChildren();
  siteicon.insertAdjacentHTML('afterbegin', svg(/^https:/i.test(active.url) ? 'lock' : isWeb(active.url) ? 'warn' : 'globe'));
  siteicon.title = /^https:/i.test(active.url) ? 'Connection is secure' : isWeb(active.url) ? 'Connection is not secure' : '';
  $('shieldbtn').classList.toggle('off', !cfg.settings.shields.enabled);
  updateShieldBadge();
  updateExtBar();
  updateBarVisibility();
}

async function go(text) {
  closeSettings();
  const m = text.trim().match(/^(?:dex|brave|chrome|about):\/\/([a-z-]+)/i);
  if (m) { openInternal(m[1].toLowerCase()); return; }
  const url = toUrl(text);
  if (!url || !active) return;
  navigateTab(active, url);
  active.view.focus();
}

function openInternal(name) {
  switch (name) {
    case 'settings': openSettings('appearance'); break;
    case 'passwords': openSettings('passwords'); break;
    case 'shields': openSettings('shields'); break;
    case 'history': showLibrary('history'); break;
    case 'bookmarks': showLibrary('bookmarks'); break;
    case 'downloads': showLibrary('downloads'); break;
    case 'extensions': openSettings('extensions'); break;
    case 'import': openSettings('import'); break;
    case 'profiles': openSettings('profiles'); break;
    case 'about': case 'version': openSettings('about'); break;
    case 'newtab': case 'start': case 'home': homeUrl().then((u) => active && navigateTab(active, u)); break;
    default: toast('Unknown page: ' + name);
  }
}

// ---------- bookmarks ----------
async function refreshBookmarks() {
  const res = await dex.bookmarksList();
  bookmarks = res.ok ? res.data : [];
  const fr = await dex.bmFolders();
  bmFolders = fr.ok ? fr.data : [];
  renderBookmarkBar();
  if (active) updateToolbar();
}

async function toggleBookmark() {
  if (!active || !isWeb(active.url)) { toast('Only web pages can be bookmarked'); return; }
  if (PRIV) { toast('Bookmarks are not saved in private windows'); return; }
  const existing = bookmarks.find((b) => b.url === active.url);
  if (existing) { showBookmarkPopup(existing, false); return; }
  const res = await dex.bookmarksAdd({ title: active.title, url: active.url });
  if (!res.ok) { toast(res.error); return; }
  bookmarks = res.data;
  renderBookmarkBar();
  updateToolbar();
  const made = bookmarks.find((b) => b.url === active.url);
  if (made) showBookmarkPopup(made, true);
  if (panelKind === 'library' && libTab === 'bookmarks') showLibrary('bookmarks');
}

// ---------- panels ----------
function openPanel(kind, title) {
  closePops();
  panelKind = kind;
  $('panel-title').textContent = title;
  $('panel').hidden = false;
  $('panel-body').replaceChildren();
  return $('panel-body');
}
function closePanel() {
  panelKind = null;
  $('panel').hidden = true;
}

function visitRow(v, opts = {}) {
  const row = el('button', { className: 'row', title: v.url },
    el('span', { className: 'a' }, v.title || hostOf(v.url)),
    el('span', { className: 'b' }, v.url),
    el('span', { className: 'b' }, opts.device ? `${v.device || ''} · ${when(v.visitedAt)}` : v.visitedAt ? when(v.visitedAt) : ''));
  row.addEventListener('click', () => { go(v.url); closePanel(); });
  if (!opts.onRemove) return row;
  const remove = el('button', { className: 'icon', title: 'Remove', onclick: opts.onRemove });
  remove.innerHTML = svg('close');
  return el('div', { className: 'item-line' }, row, remove);
}

async function showLibrary(which) {
  libTab = which || libTab;
  const body = openPanel('library', 'Library');
  const seg = el('div', { className: 'seg' });
  for (const [id, label] of [['history', 'History'], ['cloud', 'Synced'], ['bookmarks', 'Bookmarks'], ['reading', 'Reading list'], ['downloads', 'Downloads']]) {
    seg.append(el('button', { className: libTab === id ? 'on' : '', onclick: () => showLibrary(id) }, label));
  }
  const list = el('div');
  body.append(seg);

  const withSearch = (items, render, emptyText) => {
    const search = el('input', { className: 'search', placeholder: 'Search', type: 'text' });
    const out = el('div');
    const paint = () => {
      out.replaceChildren();
      const q = search.value.toLowerCase();
      const shown = items.filter((i) => !q || (i.title || '').toLowerCase().includes(q) || (i.url || '').toLowerCase().includes(q));
      if (!shown.length) out.append(el('div', { className: 'note' }, emptyText));
      for (const item of shown) out.append(render(item));
    };
    search.addEventListener('input', paint);
    list.append(search, out);
    paint();
  };

  body.append(list);

  if (libTab === 'history') {
    const res = await dex.historyList();
    const actions = el('div', { className: 'actions' }, el('button', { onclick: async () => { await dex.historyClear(); showLibrary('history'); } }, 'Clear history'));
    list.append(actions);
    withSearch(res.ok ? res.data : [], (v) => visitRow(v, { onRemove: async () => { await dex.historyRemove(v.url); showLibrary('history'); } }),
      PRIV ? 'Private windows do not save history.' : 'No history yet.');
  } else if (libTab === 'bookmarks') {
    const rm = async (b) => { const r = await dex.bookmarksRemove(b.id); if (r.ok) { bookmarks = r.data; renderBookmarkBar(); updateToolbar(); showLibrary('bookmarks'); } };
    list.append(el('div', { className: 'actions' },
      el('button', { onclick: () => promptFolder('bar', () => showLibrary('bookmarks')) }, 'New folder'),
      el('button', { onclick: () => editBookmark(null) }, 'Add page'),
      el('button', { onclick: async () => {
        const tabsNow = tabs.filter((t) => isWeb(t.url));
        if (!tabsNow.length) { toast('No web pages open'); return; }
        const r = await dex.bmAddMany({ name: 'Saved tabs ' + new Date().toLocaleDateString(), items: tabsNow.map((t) => ({ title: t.title, url: t.url })) });
        if (r.ok) { bmFolders = r.data.folders; bookmarks = r.data.bookmarks; renderBookmarkBar(); showLibrary('bookmarks'); } else toast(r.error);
      } }, 'Bookmark all tabs'),
      el('button', { onclick: async () => { const r = await dex.bmExport(); if (r.ok && r.data) toast('Saved to ' + r.data); else if (!r.ok) toast(r.error); } }, 'Export')));
    const group = (title, id, folder) => {
      const items = bookmarks.filter((b) => barOf(b) === id);
      const head = el('div', { className: 'bmfolder' }, title, el('span', { className: 'sp' }));
      if (folder) {
        head.append(el('button', { className: 'icon', title: 'Rename', onclick: () => promptFolder(folder.parent, () => showLibrary('bookmarks'), folder) }, '✎'),
          el('button', { className: 'icon', title: 'Delete folder', onclick: async () => { const r = await dex.bmFolderRemove(folder.id); if (r.ok) { bmFolders = r.data.folders; bookmarks = r.data.bookmarks; renderBookmarkBar(); showLibrary('bookmarks'); } } }, '✕'));
      }
      list.append(head);
      if (!items.length) list.append(el('div', { className: 'empty' }, 'Empty'));
      for (const b of items) list.append(visitRow(b, { onRemove: () => rm(b) }));
    };
    group('Bookmarks bar', 'bar');
    for (const f of bmFolders.filter((x) => x.parent === 'bar')) group('📁 ' + f.name, f.id, f);
    group('Other bookmarks', 'other');
    for (const f of bmFolders.filter((x) => x.parent === 'other')) group('📁 ' + f.name, f.id, f);
  } else if (libTab === 'reading') {
    const res = await dex.readingList();
    const items = res.ok ? res.data : [];
    list.append(el('div', { className: 'actions' }, el('button', { className: 'primary', onclick: async () => {
      if (!active || !isWeb(active.url)) { toast('Open a web page first'); return; }
      const r = await dex.readingAdd({ title: active.title, url: active.url });
      toast(r.ok ? 'Added to reading list' : r.error);
      showLibrary('reading');
    } }, 'Add current page')));
    withSearch(items, (b) => visitRow(b, { onRemove: async () => { await dex.readingRemove(b.id); showLibrary('reading'); } }),
      'Your reading list is empty.');
  } else if (libTab === 'downloads') {
    await paintDownloads(list);
  } else {
    await refreshSync();
    if (!sync.configured) { list.append(el('div', { className: 'note' }, 'Google sync is not set up in this build.')); return; }
    if (!sync.signedIn) {
      list.append(el('div', { className: 'note' }, 'Sign in with Google to see the history of your phone and this PC together.'),
        el('div', { className: 'actions' }, el('button', { className: 'primary', onclick: async () => { await signIn(); if (panelKind === 'library') showLibrary('cloud'); } }, 'Sign in with Google')));
      return;
    }
    list.append(el('div', { className: 'note' }, 'Loading synced history…'));
    const res = await dex.syncCloud();
    list.replaceChildren(el('div', { className: 'actions' },
      el('button', { onclick: () => showLibrary('cloud') }, 'Refresh'),
      el('button', { onclick: async () => { const r = await dex.syncUpload(); toast(r.ok ? 'History uploaded' : r.error); } }, 'Upload this PC’s history')));
    if (!res.ok) { list.append(el('div', { className: 'note' }, res.error)); return; }
    if (!res.data.length) list.append(el('div', { className: 'note' }, 'No synced history yet.'));
    for (const v of res.data) list.append(visitRow(v, { device: true }));
  }
}

async function paintDownloads(list) {
  const res = await dex.downloadsList();
  list.replaceChildren();
  for (const d of res.ok ? res.data : []) dlCache.set(d.id, d);
  const items = [...dlCache.values()].filter((d) => d.priv === PRIV).sort((a, b) => b.id - a.id);
  list.append(el('div', { className: 'actions' }, el('button', { onclick: async () => { await dex.downloadsClear(); dlCache.clear(); showLibrary('downloads'); } }, 'Clear list')));
  if (!items.length) list.append(el('div', { className: 'note' }, 'No downloads yet.'));
  for (const d of items) {
    const pct = d.total ? Math.min(100, Math.round((d.received / d.total) * 100)) : 0;
    const status = d.state === 'progressing' ? `${size(d.received)}${d.total ? ' of ' + size(d.total) : ''}` :
      d.state === 'completed' ? `${size(d.received)} · Completed` : d.state === 'cancelled' ? 'Cancelled' : d.state === 'paused' ? 'Paused' : 'Failed';
    const row = el('div', { className: 'row' },
      el('span', { className: 'a' }, d.name), el('span', { className: 'b' }, status));
    if (d.state === 'progressing') row.append(el('div', { className: 'bar' }, el('i', { style: `width:${pct}%` })));
    const acts = el('div', { className: 'actions' });
    if (d.state === 'completed') {
      acts.append(el('button', { onclick: async () => { const r = await dex.downloadsOpen(d.id); if (!r.ok) toast(r.error); } }, 'Open'),
        el('button', { onclick: async () => { const r = await dex.downloadsShow(d.id); if (!r.ok) toast(r.error); } }, 'Show in folder'));
    } else if (d.state === 'progressing') {
      acts.append(el('button', { onclick: () => dex.downloadsCancel(d.id) }, 'Cancel'));
    }
    list.append(row, acts);
  }
}

// ---------- Google sync ----------
async function refreshSync() {
  const res = await dex.syncStatus();
  if (res.ok) sync = res.data;
}

async function signIn(external) {
  if (!sync.configured) { toast('Google sync is not set up in this build'); return; }
  toast('Sign in with Google in the window that just opened');
  const res = await dex.syncSignIn({ external: !!external });
  await refreshSync();
  toast(res.ok ? 'Signed in as ' + res.data : 'Sign-in failed: ' + res.error);
}

async function showAccount() {
  await refreshSync();
  if (!sync.signedIn) {
    const body = openPanel('account', 'Google sync');
    body.append(el('div', { className: 'note' }, 'Sign in with Google to sync your history with the DexBrowse phone app. Sign-in opens in a DexBrowse window.'),
      el('div', { className: 'actions' },
        el('button', { onclick: () => { closePanel(); signIn(false); } }, 'Sign in with Google'),
        el('button', { onclick: () => { closePanel(); signIn(true); } }, 'Use system browser instead')));
    return;
  }
  const body = openPanel('account', 'Google sync');
  body.append(el('div', { className: 'note' }, 'Signed in as ' + sync.email),
    el('div', { className: 'actions' },
      el('button', { onclick: () => showLibrary('cloud') }, 'Synced history'),
      el('button', { onclick: async () => { await dex.syncSignOut(); await refreshSync(); closePanel(); toast('Signed out'); } }, 'Sign out')));
}

// ---------- Shields ----------
function switchEl(on, onChange) {
  const s = el('div', { className: 'switch' + (on ? ' on' : ''), role: 'switch', tabIndex: 0 });
  s.addEventListener('click', () => { on = !on; s.classList.toggle('on', on); onChange(on); });
  return s;
}

async function showShields() {
  const pop = $('shields-pop');
  if (!pop.hidden) { closePops(); return; }
  closePops();
  pop.replaceChildren();
  const tab = active;
  if (!tab || !isWeb(tab.url)) {
    pop.append(el('div', { className: 'note' }, 'Shields work on websites. Open a page to see what DexBrowse blocks.'),
      el('div', { className: 'sh-foot' }, el('button', { onclick: () => { closePops(); openSettings('shields'); } }, 'Shields settings')));
    pop.hidden = false;
    return;
  }
  const host = new URL(tab.url).hostname;
  const res = await dex.shieldsSite(host, tab.wcId);
  if (!res.ok) { toast(res.error); return; }
  const { rule, count } = res.data;
  const apply = async (patch) => {
    await dex.shieldsSiteSet(host, patch);
    if (tab.ready) tab.view.reload();
    setTimeout(showShieldsAgain, 400);
  };
  const showShieldsAgain = () => { $('shields-pop').hidden = true; showShields(); };

  pop.append(el('div', { className: 'sh-head' },
    iconEl('shield'),
    el('div', { className: 'host' }, host, el('div', { className: 'state' + (rule.up ? '' : ' off') }, rule.up ? 'Shields are UP for this site' : 'Shields are DOWN for this site')),
    switchEl(rule.up, (on) => apply({ off: !on }))));
  pop.append(el('div', { className: 'sh-count' }, el('b', {}, String(count || tab.blocked || 0)), el('span', {}, 'trackers, ads and scripts blocked')));
  const rowOf = (label, on, key) => {
    const r = el('div', { className: 'sh-row' + (rule.up ? '' : ' dim') }, el('div', { className: 'l' }, label), switchEl(!!on, (v) => apply({ [key]: v })));
    return r;
  };
  pop.append(rowOf('Block trackers & ads', rule.ads, 'ads'),
    rowOf('Upgrade connections to HTTPS', rule.https, 'https'),
    rowOf('Block third-party cookies', rule.cookies, 'cookies'),
    rowOf('Block scripts', rule.scripts, 'scripts'));
  pop.append(el('div', { className: 'sh-foot' },
    el('button', { onclick: () => { closePops(); openSettings('shields'); } }, 'Advanced settings')));
  pop.hidden = false;
}

// ---------- menu and popovers ----------
function closePops() {
  for (const id of ['menu', 'shields-pop', 'ctx', 'ext-pop', 'prof-pop', 'ua-pop', 'suggest', 'bmpop']) $(id).hidden = true;
}

function showMenu() {
  const menu = $('menu');
  if (!menu.hidden) { closePops(); return; }
  closePops();
  menu.replaceChildren();
  const item = (label, hint, fn) => menu.append(el('button', { className: 'item', onclick: () => { closePops(); fn(); } }, label, hint ? el('span', { className: 'k' }, hint) : null));
  item('New tab', 'Ctrl+T', () => createTab());
  item('New window', 'Ctrl+N', () => dex.windowNew(false));
  item('New private window', 'Ctrl+Shift+N', () => dex.windowNew(true));
  item(split ? 'Exit split view' : 'Split view', '', () => (split ? endSplit() : active && startSplit(active)));
  menu.append(el('hr'));
  item('Bookmarks', 'Ctrl+Shift+O', () => showLibrary('bookmarks'));
  item(cfg.settings.bookmarksBar ? 'Hide bookmarks bar' : 'Show bookmarks bar', 'Ctrl+Shift+B', () => dex.settingsSet({ bookmarksBar: !cfg.settings.bookmarksBar }));
  item('History', 'Ctrl+H', () => showLibrary('history'));
  item('Downloads', 'Ctrl+J', () => showLibrary('downloads'));
  item('Reading list', 'Ctrl+Shift+S', () => showLibrary('reading'));
  item('Passwords', '', () => openSettings('passwords'));
  item('Import from another browser…', '', () => openSettings('import'));
  menu.append(el('hr'));
  const pct = () => Math.round(Math.pow(1.2, active ? active.zoom : 0) * 100) + '%';
  const label = el('span', {}, 'Zoom ' + pct());
  menu.append(el('div', { className: 'zoomrow' }, label,
    el('button', { onclick: () => { perform('zoom-out'); label.textContent = 'Zoom ' + pct(); } }, '−'),
    el('button', { onclick: () => { perform('zoom-reset'); label.textContent = 'Zoom ' + pct(); } }, 'Reset'),
    el('button', { onclick: () => { perform('zoom-in'); label.textContent = 'Zoom ' + pct(); } }, '+')));
  item('Find in page', 'Ctrl+F', () => perform('find'));
  item('Print…', 'Ctrl+P', () => perform('print'));
  item('Save page as PDF', '', () => savePdf());
  item('Developer tools', 'F12', () => perform('devtools'));
  menu.append(el('hr'));
  if (lockEnabled) item('Lock DexBrowse', cfg.settings.lockShortcut, () => dex.lockNow());
  item(sync.signedIn ? 'Google sync: ' + sync.email : 'Google sync…', '', () => openSettings('sync'));
  item('Extensions', '', () => showExtensions());
  item('Profile: ' + cfg.profile.name, '', () => showProfiles());
  item('Settings', 'Ctrl+,', () => openSettings('appearance'));
  item('About DexBrowse', '', () => openSettings('about'));
  item('Exit', '', () => dex.windowQuit());
  menu.hidden = false;
}

// ---------- extensions ----------
const STORE_ID = /^[a-p]{32}$/;
function storeIdOf(url) {
  try {
    const u = new URL(url);
    if (!/^(chromewebstore\.google\.com|chrome\.google\.com)$/.test(u.hostname)) return null;
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    return STORE_ID.test(last) && /\/(detail|webstore)/.test(u.pathname) ? last : null;
  } catch (_) { return null; }
}
let extBarId = null;
function updateExtBar() {
  const id = !PRIV && active ? storeIdOf(active.url) : null;
  const dismissed = id && sessionStorage.getItem('extbar:' + id);
  extBarId = id;
  $('extbar').hidden = !id || !!dismissed;
  if (id) $('exttext').textContent = 'Chrome Web Store extension — add it to DexBrowse?';
}
async function installFromStore(input) {
  toast('Installing extension…');
  const r = await dex.extensionsInstallStore(input);
  toast(r.ok ? `Added ${r.data.name}` : r.error);
  if (r.ok) refreshExtButton();
  return r.ok;
}
async function refreshExtButton() {
  const r = await dex.extensionsList();
  $('extbtn').classList.toggle('has', r.ok && r.data.length > 0);
  return r.ok ? r.data : [];
}
async function showExtensions() {
  const pop = $('ext-pop');
  if (!pop.hidden) { closePops(); return; }
  closePops();
  if (PRIV) { toast('Extensions are not available in private windows'); return; }
  const list = await refreshExtButton();
  pop.replaceChildren(el('b', { style: 'display:block;padding:2px 4px 6px' }, 'Extensions'));
  if (!list.length) pop.append(el('div', { className: 'extnote' }, 'No extensions yet. Browse the Chrome Web Store and press “Add to DexBrowse”.'));
  for (const x of list) {
    pop.append(el('div', { className: 'extrow' },
      x.icon ? el('img', { src: x.icon, alt: '' }) : el('span', { className: 'av', style: 'background:#64748B' }, (x.name[0] || '?').toUpperCase()),
      el('div', { className: 't' }, el('b', {}, x.name), el('span', {}, 'v' + x.version)),
      el('button', { onclick: async () => { await dex.extensionsRemove(x.id); toast('Removed ' + x.name); showExtensions(); showExtensions(); refreshExtButton(); } }, 'Remove')));
  }
  pop.append(el('hr'));
  pop.append(el('button', { className: 'pitem', onclick: () => { closePops(); createTab('https://chromewebstore.google.com/'); } }, 'Open Chrome Web Store'));
  if (extBarId) pop.append(el('button', { className: 'pitem', onclick: () => { closePops(); installFromStore(extBarId); } }, 'Add the extension on this page'));
  pop.append(el('button', { className: 'pitem', onclick: async () => { closePops(); const r = await dex.extensionsInstallFile(); if (r.ok && r.data) { toast('Added ' + r.data.name); refreshExtButton(); } else if (!r.ok) toast(r.error); } }, 'Install from .crx / .zip file…'));
  pop.append(el('button', { className: 'pitem', onclick: async () => { closePops(); const r = await dex.extensionsInstallUnpacked(); if (r.ok && r.data) { toast('Loaded ' + r.data.name); refreshExtButton(); } else if (!r.ok) toast(r.error); } }, 'Load unpacked folder…'));
  pop.append(el('div', { className: 'extnote' }, 'DexBrowse runs on Electron, which supports many but not all Chrome extension APIs. Content-script extensions (dark mode, ad/cookie tools, page tweaks) work best; toolbar popups are not shown.'));
  pop.hidden = false;
}

// ---------- profiles ----------
function avatar(p, cls) {
  return el('span', { className: cls || 'av', style: `background:${p.color}` }, (p.name[0] || '?').toUpperCase());
}
function paintProfileButton() {
  const p = cfg.profile;
  const b = $('profbtn');
  b.style.background = p.color;
  b.textContent = (p.name[0] || '?').toUpperCase();
  b.title = 'Profile: ' + p.name;
}
async function showProfiles() {
  const pop = $('prof-pop');
  if (!pop.hidden) { closePops(); return; }
  closePops();
  pop.replaceChildren(el('div', { className: 'pitem' }, avatar(cfg.profile), el('b', {}, cfg.profile.name), el('small', {}, cfg.guest ? 'Guest' : 'This window')));
  pop.append(el('hr'));
  if (!cfg.guest) {
    pop.append(el('button', { className: 'pitem', onclick: () => { closePops(); dex.lockNow(); } }, 'Lock', el('small', {}, cfg.settings.lockShortcut)));
    pop.append(el('button', { className: 'pitem', onclick: () => { closePops(); openSettings('profiles'); } }, 'Manage this profile'));
    pop.append(el('hr'));
  }
  pop.append(el('button', { className: 'pitem', onclick: () => { closePops(); dex.windowNew(false); } }, 'New window'));
  pop.append(el('button', { className: 'pitem', onclick: () => { closePops(); dex.windowNew(true); } }, 'New private window'));
  pop.hidden = false;
}

// ---------- find, print ----------
function openFind() {
  $('findbar').hidden = false;
  $('findinput').focus();
  $('findinput').select();
}
function closeFind() {
  $('findbar').hidden = true;
  $('findcount').textContent = '';
  if (active && active.ready) active.view.stopFindInPage('clearSelection');
}
function findNext(forward) {
  const text = $('findinput').value;
  if (!active || !active.ready || !text) { $('findcount').textContent = ''; return; }
  active.view.findInPage(text, { forward, findNext: true });
}

function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function savePdf() {
  if (!active || !active.ready) return;
  try {
    const data = await active.view.printToPDF({});
    const res = await dex.savePdf(bytesToB64(new Uint8Array(data)), active.title || 'page');
    if (res.ok && res.data) toast('Saved PDF');
  } catch (e) {
    toast('Could not save PDF');
  }
}

// ---------- saved logins ----------
async function onGuestMessage(tab, e) {
  const data = e.args && e.args[0];
  if (!data || PRIV) return;
  const current = (() => { try { return new URL(tab.view.getURL()).origin; } catch (_) { return ''; } })();
  if (data.origin !== current) return;
  if (e.channel === 'login-request') {
    if (!(/^https:/.test(data.origin) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(data.origin))) return;
    const res = await dex.loginsAccounts(data.origin);
    if (!res.ok || !res.data.length) return;
    if (res.data.length === 1 && cfg.settings.autofill) {
      const one = await dex.loginsFill(res.data[0].id);
      if (one.ok && one.data) tab.view.send('login-fill', one.data);
    } else {
      tab.view.send('login-accounts', res.data);
    }
  } else if (e.channel === 'login-manage') {
    openSettings('passwords');
  } else if (e.channel === 'login-pick') {
    const one = await dex.loginsFill(data.id);
    if (one.ok && one.data) tab.view.send('login-fill', one.data);
  } else if (e.channel === 'login-submit') {
    if (!cfg.settings.savePasswords || cfg.settings.neverSave.includes(data.origin)) return;
    const now = Date.now();
    if (pendingSave && pendingSave.data.password === data.password && pendingSave.data.origin === data.origin && now - pendingSave.at < 3000) return;
    const known = await dex.loginsList();
    const existing = known.ok && known.data.some((l) => l.origin === data.origin && l.username === data.username);
    pendingSave = { data, at: now, update: existing };
    $('savetext').textContent = `${existing ? 'Update' : 'Save'} password for ${data.username || 'this account'} on ${hostOf(data.origin)}?`;
    $('savego').textContent = existing ? 'Update' : 'Save';
    $('savebar').hidden = false;
    clearTimeout(onGuestMessage.timer);
    onGuestMessage.timer = setTimeout(() => { $('savebar').hidden = true; pendingSave = null; }, 60000);
  }
}

// ---------- settings page hooks ----------
function closeSettings() {
  if (!settingsOpen) return;
  settingsOpen = false;
  $('settings').hidden = true;
  applyLayout();
  renderTabs();
  updateToolbar();
}
function openSettings(section) {
  settingsOpen = true;
  closePops();
  closePanel();
  $('settings').hidden = false;
  applyLayout();
  renderTabs();
  renderSettings(section);
}

// ---------- lock ----------
function showLock(state) {
  document.body.classList.toggle('locked', state);
  $('lock').hidden = !state;
  if (state) {
    closePops(); closePanel(); closeSettings();
    $('lockinput').value = '';
    $('lockerr').textContent = '';
    setTimeout(() => $('lockinput').focus(), 50);
  }
}
async function tryUnlock() {
  const res = await dex.lockUnlock($('lockinput').value);
  if (!res.ok) { $('lockerr').textContent = res.error; $('lockinput').select(); return; }
  if (res.data === 'opening') { $('lockerr').textContent = 'Opening…'; $('lockinput').value = ''; return; }
  showLock(false);
}

// ---------- shortcuts ----------
function perform(action) {
  if (action.startsWith('tab-')) {
    const n = Number(action.slice(4));
    const target = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1];
    if (target) activateTab(target);
    return;
  }
  if (action === 'new-tab') { createTab(); return; }
  if (action === 'new-window') { dex.windowNew(false); return; }
  if (action === 'new-private-window') { dex.windowNew(true); return; }
  if (action === 'history') { panelKind === 'library' && libTab === 'history' ? closePanel() : showLibrary('history'); return; }
  if (action === 'downloads') { showLibrary('downloads'); return; }
  if (action === 'bookmarks') { showLibrary('bookmarks'); return; }
  if (action === 'reading-list') { showLibrary('reading'); return; }
  if (action === 'settings') { openSettings('appearance'); return; }
  if (action === 'clear-data') { openSettings('data'); return; }
  if (action === 'lock') { dex.lockNow(); return; }
  if (action === 'toggle-bookmarks-bar') { dex.settingsSet({ bookmarksBar: !cfg.settings.bookmarksBar }); return; }
  if (action === 'focus-address') { $('address').focus(); $('address').select(); return; }
  if (action === 'reopen-tab') { const u = closed.pop(); if (u) createTab(u); return; }
  if (!active) return;
  const v = active.view;
  const ready = active.ready;
  switch (action) {
    case 'close-tab': if (!active.pinned) closeTab(active); break;
    case 'reload': if (ready) (active.loading ? v.stop() : v.reload()); break;
    case 'back': if (ready && v.canGoBack()) v.goBack(); break;
    case 'forward': if (ready && v.canGoForward()) v.goForward(); break;
    case 'devtools': if (ready) v.openDevTools(); break;
    case 'find': openFind(); break;
    case 'print': if (ready) v.print(); break;
    case 'bookmark': toggleBookmark(); break;
    case 'next-tab': activateTab(tabs[(tabs.indexOf(active) + 1) % tabs.length]); break;
    case 'prev-tab': activateTab(tabs[(tabs.indexOf(active) - 1 + tabs.length) % tabs.length]); break;
    case 'zoom-in': active.zoom = Math.min(active.zoom + 0.5, 5); if (ready) v.setZoomLevel(active.zoom); break;
    case 'zoom-out': active.zoom = Math.max(active.zoom - 0.5, -3); if (ready) v.setZoomLevel(active.zoom); break;
    case 'zoom-reset': active.zoom = 0; if (ready) v.setZoomLevel(0); break;
  }
}

let sessionTimer = null;
function scheduleSessionSave() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => dex.sessionSave(tabs.map((t) => t.url).filter(isWeb)), 1000);
}

// ---------- boot ----------
async function boot() {
  const res = await dex.config();
  cfg = res.data;
  lockEnabled = cfg.lockEnabled;
  document.body.classList.toggle('private', PRIV);
  $('privbadge').hidden = !PRIV;
  applyTheme();
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);

  for (const [id, icon] of [['newtab', 'plus'], ['back', 'back'], ['forward', 'forward'], ['reload', 'reload'], ['siteicon', 'globe'],
    ['star', 'star'], ['shieldbtn', 'shield'], ['menubtn', 'menu'], ['findprev', 'up'], ['findnext', 'down'],
    ['extbtn', 'puzzle'], ['extclose', 'close'], ['findclose', 'close'], ['savelater', 'close'], ['panel-close', 'close'], ['lockicon', 'lock']]) setIcon(id, icon);

  $('newtab').addEventListener('click', () => createTab());
  $('back').addEventListener('click', () => perform('back'));
  $('forward').addEventListener('click', () => perform('forward'));
  $('reload').addEventListener('click', () => perform('reload'));
  $('star').addEventListener('click', toggleBookmark);
  $('shieldbtn').addEventListener('click', showShields);
  $('extbtn').addEventListener('click', showExtensions);
  $('profbtn').addEventListener('click', showProfiles);
  $('extadd').addEventListener('click', async () => { if (extBarId && await installFromStore(extBarId)) $('extbar').hidden = true; });
  $('extclose').addEventListener('click', () => { if (extBarId) sessionStorage.setItem('extbar:' + extBarId, '1'); $('extbar').hidden = true; });
  paintProfileButton();
  initExtras();
  refreshExtButton();
  $('menubtn').addEventListener('click', showMenu);
  $('panel-close').addEventListener('click', closePanel);
  $('address').addEventListener('keydown', (e) => {
    if (onAddressKey(e)) return;
    if (e.key === 'Enter') { hideSuggest(); go($('address').value); }
    if (e.key === 'Escape') { updateToolbar(); active && active.view.focus(); }
  });
  $('address').addEventListener('focus', () => $('address').select());
  $('findinput').addEventListener('input', () => findNext(true));
  $('findinput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') findNext(!e.shiftKey);
    if (e.key === 'Escape') closeFind();
  });
  $('findprev').addEventListener('click', () => findNext(false));
  $('findnext').addEventListener('click', () => findNext(true));
  $('findclose').addEventListener('click', closeFind);
  $('savego').addEventListener('click', async () => {
    if (!pendingSave) return;
    const r = await dex.loginsSave(pendingSave.data);
    toast(r.ok ? 'Password saved' : r.error);
    pendingSave = null;
    $('savebar').hidden = true;
  });
  $('savenever').addEventListener('click', async () => {
    if (pendingSave) await dex.loginsNeverAdd(pendingSave.data.origin);
    cfg.settings.neverSave = (await dex.loginsNever()).data || [];
    pendingSave = null;
    $('savebar').hidden = true;
  });
  $('savelater').addEventListener('click', () => { pendingSave = null; $('savebar').hidden = true; });
  $('lockgo').addEventListener('click', tryUnlock);
  $('lockinput').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });

  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.pop') || e.target.closest('#menubtn') || e.target.closest('#shieldbtn') || e.target.closest('#extbtn') || e.target.closest('#profbtn') || e.target.closest('#uabtn')) return;
    closePops();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePops(); if (!$('findbar').hidden) closeFind(); }
  });
  let lastPing = 0;
  document.addEventListener('mousemove', () => {
    if (lockEnabled && Date.now() - lastPing > 5000) { lastPing = Date.now(); dex.activity(); }
  });

  dex.on('shortcut', perform);
  dex.on('open-tab', (url) => createTab(url));
  dex.on('blocked', ({ id, count }) => {
    pendingBlocked.set(id, count);
    const t = tabs.find((x) => x.wcId === id);
    if (t) { t.blocked = count; if (t === active) updateShieldBadge(); }
  });
  dex.on('download-update', (d) => {
    dlCache.set(d.id, d);
    if (d.state === 'completed') toast(`Downloaded ${d.name}`);
    else if (d.state === 'cancelled' || d.state === 'interrupted') toast(`Download ${d.state}: ${d.name}`);
    if (panelKind === 'library' && libTab === 'downloads') paintDownloads($('panel-body').lastChild);
  });
  dex.on('settings-changed', async (settings) => {
    cfg.settings = settings;
    applyTheme();
    renderBookmarkBar();
    if (active) updateToolbar();
    if (settingsOpen) renderSettings(currentSection());
  });
  dex.on('update', (u) => {
    if (window.onUpdateState) window.onUpdateState(u);
    if (u.state === 'ready') {
      $('updatetext').textContent = `DexBrowse ${u.version} is ready.`;
      $('updatebar').hidden = false;
    } else if (u.state === 'downloading') {
      toast(`Downloading update ${u.version}…`);
    }
  });
  dex.updateStatus().then((r) => { // windows opened after the download finished still need to show the bar
    if (r.ok && r.data.state === 'ready') { $('updatetext').textContent = `DexBrowse ${r.data.version} is ready.`; $('updatebar').hidden = false; }
  });
  $('updatego').addEventListener('click', () => { $('updatego').textContent = 'Installing…'; dex.updateInstall(); });
  $('updateclose').addEventListener('click', () => { $('updatebar').hidden = true; });
  setIcon('updateclose', 'close');
  setIcon('gclose', 'close');
  $('gopen').addEventListener('click', () => { if (googleBlockedUrl) dex.openExternal(googleBlockedUrl); $('gbar').hidden = true; });
  $('gclose').addEventListener('click', () => { $('gbar').hidden = true; });
  dex.on('lock', async (state) => {
    if (state) { lockEnabled = true; showLock(true); }
    else { const s = await dex.lockStatus(); lockEnabled = !!(s.data && s.data.enabled); showLock(false); if (active) wakeTab(active); applyLayout(); }
  });
  // the profile that was left: every tab, even the one in view, is put to sleep until it is unlocked again
  dex.on('sleep-all', () => {
    for (const t of tabs) sleepTab(t, true);
  });

  const lock = await dex.lockStatus();
  lockEnabled = !!(lock.data && lock.data.enabled);
  if (lock.data && lock.data.locked) showLock(true);

  await refreshBookmarks();
  await refreshSync();

  const restore = PRIV ? [] : ((await dex.sessionLoad()).data || []);
  if (restore.length) {
    restore.forEach((u, i) => createTab(u, i === 0));
  } else {
    const home = await homeUrl();
    createTab(isStart(home) ? 'dex://start' : home);
  }
}
