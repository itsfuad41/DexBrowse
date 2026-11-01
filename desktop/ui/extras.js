'use strict';
// Toolbar extras: user-agent switcher, address bar suggestions, bookmark bar controls.

ICONS.monitor = '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>';

// ---------- user agent switcher ----------
async function showUAPop() {
  const pop = $('ua-pop');
  if (!pop.hidden) { closePops(); return; }
  closePops();
  const res = await dex.uaList();
  if (!res.ok) { toast(res.error); return; }
  const current = cfg.settings.ua || res.data.current;
  pop.replaceChildren(el('b', { style: 'display:block;padding:2px 6px 6px' }, 'User agent'));
  const list = el('div', { className: 'ualist' });
  for (const name of res.data.names) {
    list.append(el('button', {
      className: 'pitem' + (name === current ? ' on' : ''),
      onclick: async () => {
        const r = await dex.uaSet(name);
        if (!r.ok) { toast(r.error); return; }
        cfg.settings.ua = name;
        paintUABtn();
        closePops();
        toast(`User agent: ${name}. Open pages keep their old one until you reload them.`);
      }
    }, name, name === current ? el('small', {}, '✓') : null));
  }
  pop.append(list, el('div', { className: 'extnote' }, 'Pages already open are not reloaded. Reload a tab when you want it to use the new one.'));
  pop.hidden = false;
}
function paintUABtn() {
  const b = $('uabtn');
  b.title = 'User agent: ' + (cfg.settings.ua || '');
}

// ---------- address bar suggestions ----------
let sugItems = [];
let sugIndex = -1;
let sugSeq = 0;
let sugTimer = null;

function hideSuggest() {
  $('suggest').hidden = true;
  sugItems = [];
  sugIndex = -1;
}
function paintSuggest() {
  const box = $('suggest');
  box.replaceChildren();
  sugItems.forEach((it, i) => {
    const row = el('button', { className: 'sug' + (i === sugIndex ? ' on' : '') },
      el('span', { className: 'sk' }, it.icon),
      el('span', { className: 'st' }, it.label, it.sub ? el('em', {}, it.sub) : null));
    row.addEventListener('mousedown', (e) => { e.preventDefault(); chooseSuggest(i); });
    box.append(row);
  });
  box.hidden = !sugItems.length;
}
function chooseSuggest(i) {
  const it = sugItems[i];
  hideSuggest();
  if (it) go(it.value);
}
async function updateSuggest() {
  const text = $('address').value.trim();
  if (!text || document.activeElement !== $('address') || /^(dex|brave|chrome|about):/i.test(text)) { hideSuggest(); return; }
  const seq = ++sugSeq;
  const res = await dex.suggest(text);
  if (seq !== sugSeq || document.activeElement !== $('address')) return;
  const data = res.ok ? res.data : { local: [], remote: [] };
  const isUrl = toUrl(text) !== engineUrl() + encodeURIComponent(text);
  const items = [isUrl
    ? { icon: '↵', label: text, sub: 'Open this address', value: text }
    : { icon: '⌕', label: text, sub: 'Search with ' + cfg.settings.engine, value: text }];
  for (const l of data.local) {
    items.push({ icon: l.kind === 'bookmark' ? '★' : '◷', label: l.title || l.url, sub: l.url, value: l.url });
  }
  for (const r of data.remote) {
    if (r.toLowerCase() !== text.toLowerCase()) items.push({ icon: '⌕', label: r, value: r });
  }
  sugItems = items.slice(0, 10);
  sugIndex = -1;
  paintSuggest();
}
function onAddressInput() {
  clearTimeout(sugTimer);
  sugTimer = setTimeout(updateSuggest, 110);
}
// returns true when the key was used by the list
function onAddressKey(e) {
  if (!sugItems.length) return false;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = sugItems.length;
    sugIndex = e.key === 'ArrowDown' ? (sugIndex + 1) % n : (sugIndex - 1 + n) % n;
    paintSuggest();
    return true;
  }
  if (e.key === 'Enter' && sugIndex >= 0) { e.preventDefault(); chooseSuggest(sugIndex); return true; }
  if (e.key === 'Escape') { hideSuggest(); return true; }
  return false;
}

// ---------- bookmark bar ----------
function bookmarkBarVisible() {
  const s = cfg.settings;
  if (!s.bookmarksBar) return false;
  return s.bookmarksBarMode === 'always' || !active || isStart(active.url);
}
function updateBarVisibility() {
  $('bmbar').hidden = !bookmarkBarVisible();
}

function editBookmark(b) {
  const dlg = $('editdlg');
  $('ed-title').value = b.title;
  $('ed-url').value = b.url;
  dlg.hidden = false;
  $('ed-title').focus();
  dlg.dataset.id = b.id;
}
async function saveBookmarkEdit() {
  const dlg = $('editdlg');
  const r = await dex.bookmarksUpdate(dlg.dataset.id, { title: $('ed-title').value, url: $('ed-url').value.trim() });
  dlg.hidden = true;
  if (r.ok) { bookmarks = r.data; renderBookmarkBar(); } else toast(r.error);
}
function bookmarkMenu(b, x, y) {
  closePops();
  const box = $('ctx');
  box.replaceChildren();
  const add = (label, fn) => box.append(el('button', { onclick: () => { closePops(); fn(); } }, label));
  add('Open', () => go(b.url));
  add('Open in new tab', () => createTab(b.url));
  add('Edit…', () => editBookmark(b));
  add('Delete', async () => { const r = await dex.bookmarksRemove(b.id); if (r.ok) { bookmarks = r.data; renderBookmarkBar(); updateToolbar(); } });
  box.append(el('hr'));
  add(cfg.settings.bookmarksBarMode === 'always' ? 'Show bar only on new tab page' : 'Always show bookmarks bar', () => dex.settingsSet({ bookmarksBarMode: cfg.settings.bookmarksBarMode === 'always' ? 'newtab' : 'always' }));
  add('Hide bookmarks bar', () => dex.settingsSet({ bookmarksBar: false }));
  box.style.left = Math.min(x, innerWidth - 210) + 'px';
  box.style.top = Math.min(y, innerHeight - 220) + 'px';
  box.hidden = false;
}
function allBookmarksMenu(anchor) {
  closePops();
  const box = $('ctx');
  box.replaceChildren(...bookmarks.map((b) => el('button', { onclick: () => { closePops(); go(b.url); } }, b.title)));
  const r = anchor.getBoundingClientRect();
  box.style.left = Math.max(8, Math.min(r.left, innerWidth - 260)) + 'px';
  box.style.top = r.bottom + 4 + 'px';
  box.style.maxHeight = '60vh';
  box.style.overflow = 'auto';
  box.hidden = false;
}

let dragId = null;
function renderBookmarkBar() {
  const bar = $('bmbar');
  updateBarVisibility();
  bar.replaceChildren();
  if (!bookmarks.length) { bar.append(el('span', { className: 'hint' }, 'Bookmarks you add appear here (Ctrl+D). Right-click for options.')); }
  for (const b of bookmarks) {
    const chip = el('button', { className: 'chip', title: b.url, draggable: true, onclick: () => go(b.url) }, b.title);
    chip.dataset.id = b.id;
    chip.addEventListener('contextmenu', (e) => { e.preventDefault(); bookmarkMenu(b, e.clientX, e.clientY); });
    chip.addEventListener('auxclick', (e) => { if (e.button === 1) createTab(b.url); });
    chip.addEventListener('dragstart', (e) => { dragId = b.id; e.dataTransfer.effectAllowed = 'move'; chip.classList.add('drag'); });
    chip.addEventListener('dragend', () => { dragId = null; chip.classList.remove('drag'); });
    chip.addEventListener('dragover', (e) => { if (dragId && dragId !== b.id) { e.preventDefault(); chip.classList.add('over'); } });
    chip.addEventListener('dragleave', () => chip.classList.remove('over'));
    chip.addEventListener('drop', async (e) => {
      e.preventDefault();
      chip.classList.remove('over');
      if (!dragId || dragId === b.id) return;
      const ids = bookmarks.map((x) => x.id).filter((x) => x !== dragId);
      ids.splice(ids.indexOf(b.id), 0, dragId);
      const r = await dex.bookmarksReorder(ids);
      if (r.ok) { bookmarks = r.data; renderBookmarkBar(); }
    });
    bar.append(chip);
  }
  const more = el('button', { className: 'chip more', title: 'All bookmarks' }, '»');
  more.addEventListener('click', () => allBookmarksMenu(more));
  if (bookmarks.length) bar.append(more);
}

function initExtras() {
  setIcon('uabtn', 'monitor');
  paintUABtn();
  $('uabtn').addEventListener('click', showUAPop);
  $('address').addEventListener('input', onAddressInput);
  $('address').addEventListener('blur', () => setTimeout(hideSuggest, 120));
  $('ed-save').addEventListener('click', saveBookmarkEdit);
  $('ed-cancel').addEventListener('click', () => { $('editdlg').hidden = true; });
  for (const id of ['ed-title', 'ed-url']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBookmarkEdit(); if (e.key === 'Escape') $('editdlg').hidden = true; });
  $('bmbar').addEventListener('contextmenu', (e) => {
    if (e.target === $('bmbar') || e.target.classList.contains('hint')) {
      e.preventDefault();
      closePops();
      const box = $('ctx');
      box.replaceChildren(
        el('button', { onclick: () => { closePops(); dex.settingsSet({ bookmarksBarMode: cfg.settings.bookmarksBarMode === 'always' ? 'newtab' : 'always' }); } }, cfg.settings.bookmarksBarMode === 'always' ? 'Show bar only on new tab page' : 'Always show bookmarks bar'),
        el('button', { onclick: () => { closePops(); dex.settingsSet({ bookmarksBar: false }); } }, 'Hide bookmarks bar'));
      box.style.left = Math.min(e.clientX, innerWidth - 210) + 'px';
      box.style.top = e.clientY + 'px';
      box.hidden = false;
    }
  });
}
