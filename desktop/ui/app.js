'use strict';

const $ = (id) => document.getElementById(id);
const START = new URL('start.html', location.href).href;
const SEARCH = 'https://www.google.com/search?q=';

const tabs = [];
let active = null;
let seq = 0;
let sync = { configured: false, signedIn: false, email: '' };
let panelKind = null;

// ---------- helpers ----------
function el(tag, props, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props || {});
  for (const child of children) {
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

let toastTimer = null;
function toast(message) {
  const box = $('toast');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 3500);
}

function toUrl(text) {
  text = text.trim();
  if (!text) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^(about|data|view-source):/i.test(text)) return text;
  if (/^localhost(:\d+)?([/?#]|$)/i.test(text) || /^(\d{1,3}\.){3}\d{1,3}(:\d+)?([/?#]|$)/.test(text)) {
    return 'http://' + text;
  }
  if (!/\s/.test(text) && /^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(text)) return 'https://' + text;
  return SEARCH + encodeURIComponent(text);
}

function hostOf(url) {
  try { return new URL(url).host || url; } catch (_) { return url; }
}

function when(ts) {
  return new Date(ts).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ---------- tabs ----------
function createTab(url = START, activate = true) {
  const view = document.createElement('webview');
  view.setAttribute('partition', 'persist:browse');
  view.setAttribute('allowpopups', '');
  view.setAttribute('plugins', '');
  view.setAttribute('src', url);

  const tab = { id: ++seq, view, title: 'New tab', url, loading: false, favicon: '', ready: false, recorded: '', zoom: 0 };
  tabs.push(tab);

  view.addEventListener('dom-ready', () => { tab.ready = true; if (tab === active) updateToolbar(); });
  view.addEventListener('page-title-updated', (e) => { tab.title = e.title || tab.title; renderTabs(); });
  view.addEventListener('page-favicon-updated', (e) => { tab.favicon = (e.favicons && e.favicons[0]) || ''; renderTabs(); });
  view.addEventListener('did-start-loading', () => { tab.loading = true; if (tab === active) updateToolbar(); });
  view.addEventListener('did-stop-loading', () => {
    tab.loading = false;
    recordVisit(tab);
    if (tab === active) updateToolbar();
    renderTabs();
  });
  view.addEventListener('did-navigate', (e) => onNavigate(tab, e.url));
  view.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) onNavigate(tab, e.url); });
  view.addEventListener('did-fail-load', (e) => {
    if (!e.isMainFrame || e.errorCode === -3) return;
    const page = '<body style="font-family:system-ui;background:#0B1220;color:#E2E8F0;text-align:center;padding-top:15vh">' +
      '<h2>This page can’t be reached</h2><p style="color:#94A3B8">Check the address and your internet connection.</p></body>';
    view.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page));
    tab.failedUrl = e.validatedURL;
  });

  $('views').append(view);
  if (activate) activateTab(tab);
  else renderTabs();
  return tab;
}

function onNavigate(tab, url) {
  if (url.startsWith('data:')) return;
  tab.url = url;
  tab.failedUrl = null;
  if (url === START) tab.title = 'New tab';
  if (tab === active) updateToolbar();
}

function recordVisit(tab) {
  if (!/^https?:\/\//i.test(tab.url) || tab.recorded === tab.url) return;
  tab.recorded = tab.url;
  window.dex.historyAdd({ url: tab.url, title: tab.title });
}

function activateTab(tab) {
  active = tab;
  for (const t of tabs) t.view.classList.toggle('active', t === tab);
  renderTabs();
  updateToolbar();
  if (tab.url === START) $('address').focus();
}

function closeTab(tab) {
  const index = tabs.indexOf(tab);
  if (index < 0) return;
  tabs.splice(index, 1);
  tab.view.remove();
  if (!tabs.length) { createTab(); return; }
  if (active === tab) activateTab(tabs[Math.min(index, tabs.length - 1)]);
  else renderTabs();
}

function renderTabs() {
  const strip = $('tabs');
  strip.replaceChildren();
  for (const tab of tabs) {
    const node = el('div', { className: 'tab' + (tab === active ? ' active' : ''), title: tab.title });
    if (tab.favicon) node.append(el('img', { src: tab.favicon, alt: '' }));
    node.append(el('span', { className: 't' }, tab.loading ? 'Loading…' : tab.title));
    const close = el('button', { className: 'x', title: 'Close tab' }, '×');
    close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab); });
    node.append(close);
    node.addEventListener('click', () => activateTab(tab));
    node.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(tab); });
    strip.append(node);
  }
  const t = active ? active.title : '';
  document.title = t ? `${t} – DexBrowse` : 'DexBrowse By Fuad';
}

function updateToolbar() {
  if (!active) return;
  const v = active.view;
  if (document.activeElement !== $('address')) {
    $('address').value = active.url === START ? '' : (active.failedUrl || active.url);
  }
  $('back').disabled = !(active.ready && v.canGoBack());
  $('forward').disabled = !(active.ready && v.canGoForward());
  $('reload').textContent = active.loading ? '✕' : '⟳';
  $('progress').classList.toggle('on', active.loading);
}

function go(text) {
  const url = toUrl(text);
  if (!url || !active) return;
  active.view.loadURL(url).catch(() => {});
  active.view.focus();
}

// ---------- panels ----------
function openPanel(kind, title) {
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

function visitRow(v, device) {
  const row = el('button', { className: 'row', title: v.url },
    el('span', { className: 'a' }, v.title || hostOf(v.url)),
    el('span', { className: 'b' }, `${v.url}`),
    el('span', { className: 'b' }, device ? `${v.device || ''} · ${when(v.visitedAt)}` : when(v.visitedAt)));
  row.addEventListener('click', () => { go(v.url); closePanel(); });
  return row;
}

async function showHistory(tabName) {
  const body = openPanel('history', 'History');
  const seg = el('div', { className: 'seg' });
  const local = el('button', { className: tabName === 'cloud' ? '' : 'on' }, 'This PC');
  const cloud = el('button', { className: tabName === 'cloud' ? 'on' : '' }, 'All devices (Google)');
  local.addEventListener('click', () => showHistory('local'));
  cloud.addEventListener('click', () => showHistory('cloud'));
  seg.append(local, cloud);
  const list = el('div');
  body.append(seg, list);

  if (tabName !== 'cloud') {
    const res = await window.dex.historyList();
    const items = res.ok ? res.data : [];
    const actions = el('div', { className: 'actions' });
    const clear = el('button', {}, 'Clear history');
    clear.addEventListener('click', async () => { await window.dex.historyClear(); showHistory('local'); });
    actions.append(clear);
    list.append(actions);
    if (!items.length) list.append(el('div', { className: 'note' }, 'No history yet.'));
    for (const v of items) list.append(visitRow(v, false));
    return;
  }

  await refreshSync();
  if (!sync.configured) {
    list.append(el('div', { className: 'note' }, 'Google sync is not set up in this build.'));
    return;
  }
  if (!sync.signedIn) {
    list.append(el('div', { className: 'note' }, 'Sign in with Google to see the history of your phone and this PC together.'));
    const actions = el('div', { className: 'actions' });
    const btn = el('button', { className: 'primary' }, 'Sign in with Google');
    btn.addEventListener('click', async () => { await signIn(); if (panelKind === 'history') showHistory('cloud'); });
    actions.append(btn);
    list.append(actions);
    return;
  }
  list.append(el('div', { className: 'note' }, 'Loading synced history…'));
  const res = await window.dex.syncCloud();
  list.replaceChildren();
  const actions = el('div', { className: 'actions' });
  const refresh = el('button', {}, 'Refresh');
  refresh.addEventListener('click', () => showHistory('cloud'));
  const upload = el('button', {}, 'Upload this PC’s history');
  upload.addEventListener('click', async () => {
    const r = await window.dex.syncUpload();
    toast(r.ok ? 'History uploaded' : r.error);
  });
  actions.append(refresh, upload);
  list.append(actions);
  if (!res.ok) { list.append(el('div', { className: 'note' }, res.error)); return; }
  if (!res.data.length) list.append(el('div', { className: 'note' }, 'No synced history yet.'));
  for (const v of res.data) list.append(visitRow(v, true));
}

async function showUserAgents() {
  const body = openPanel('ua', 'User agent');
  const res = await window.dex.uaList();
  if (!res.ok) { body.append(el('div', { className: 'note' }, res.error)); return; }
  body.append(el('div', { className: 'note' }, 'Choose how this browser identifies itself to websites. The page reloads after you pick one.'));
  for (const name of res.data.names) {
    const row = el('button', { className: 'row' + (name === res.data.current ? ' sel' : '') },
      el('span', { className: 'a' }, (name === res.data.current ? '✓ ' : '') + name));
    row.addEventListener('click', async () => {
      const r = await window.dex.uaSet(name);
      if (!r.ok) { toast(r.error); return; }
      toast('User agent: ' + name);
      for (const t of tabs) if (t.ready && /^https?:/i.test(t.url)) t.view.reloadIgnoringCache();
      closePanel();
    });
    body.append(row);
  }
}

// ---------- Google sync ----------
async function refreshSync() {
  const res = await window.dex.syncStatus();
  if (res.ok) sync = res.data;
  const btn = $('acct');
  btn.textContent = sync.signedIn ? sync.email || 'Signed in' : 'Sign in';
  btn.classList.toggle('on', sync.signedIn);
  btn.title = sync.signedIn ? 'Google sync: ' + sync.email : 'Sign in with Google to sync history';
}

async function signIn() {
  if (!sync.configured) { toast('Google sync is not set up in this build'); return; }
  toast('Finish signing in with Google in your browser');
  const res = await window.dex.syncSignIn();
  await refreshSync();
  toast(res.ok ? 'Signed in as ' + res.data : 'Sign-in failed: ' + res.error);
}

async function showAccount() {
  await refreshSync();
  if (!sync.signedIn) { await signIn(); return; }
  const body = openPanel('account', 'Google sync');
  body.append(el('div', { className: 'note' }, 'Signed in as ' + sync.email));
  const actions = el('div', { className: 'actions' });
  const hist = el('button', {}, 'Synced history');
  hist.addEventListener('click', () => showHistory('cloud'));
  const out = el('button', {}, 'Sign out');
  out.addEventListener('click', async () => { await window.dex.syncSignOut(); await refreshSync(); closePanel(); toast('Signed out'); });
  actions.append(hist, out);
  body.append(actions);
}

// ---------- wiring ----------
function perform(action) {
  if (!active) return;
  const v = active.view;
  switch (action) {
    case 'new-tab': createTab(); break;
    case 'close-tab': closeTab(active); break;
    case 'focus-address': $('address').focus(); $('address').select(); break;
    case 'reload': active.loading ? v.stop() : v.reload(); break;
    case 'history': panelKind === 'history' ? closePanel() : showHistory('local'); break;
    case 'back': if (active.ready && v.canGoBack()) v.goBack(); break;
    case 'forward': if (active.ready && v.canGoForward()) v.goForward(); break;
    case 'devtools': v.openDevTools(); break;
    case 'next-tab': activateTab(tabs[(tabs.indexOf(active) + 1) % tabs.length]); break;
    case 'prev-tab': activateTab(tabs[(tabs.indexOf(active) - 1 + tabs.length) % tabs.length]); break;
    case 'zoom-in': active.zoom = Math.min(active.zoom + 0.5, 5); v.setZoomLevel(active.zoom); break;
    case 'zoom-out': active.zoom = Math.max(active.zoom - 0.5, -3); v.setZoomLevel(active.zoom); break;
    case 'zoom-reset': active.zoom = 0; v.setZoomLevel(0); break;
  }
}

$('newtab').addEventListener('click', () => createTab());
$('back').addEventListener('click', () => perform('back'));
$('forward').addEventListener('click', () => perform('forward'));
$('reload').addEventListener('click', () => perform('reload'));
$('home').addEventListener('click', () => active && active.view.loadURL(START));
$('uabtn').addEventListener('click', () => (panelKind === 'ua' ? closePanel() : showUserAgents()));
$('histbtn').addEventListener('click', () => (panelKind === 'history' ? closePanel() : showHistory('local')));
$('acct').addEventListener('click', showAccount);
$('panel-close').addEventListener('click', closePanel);
$('address').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') go($('address').value);
  if (e.key === 'Escape') { updateToolbar(); active && active.view.focus(); }
});
$('address').addEventListener('focus', () => $('address').select());

window.dex.on('shortcut', perform);
window.dex.on('open-tab', (url) => createTab(url));
window.dex.on('download', ({ name, state }) => {
  toast(state === 'completed' ? `Downloaded ${name}` : `Download ${state}: ${name}`);
});

refreshSync();
createTab();
