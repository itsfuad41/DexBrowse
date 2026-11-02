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

const barOf = (b) => (b.folder || 'bar');
const folderOptions = () => [['bar', 'Bookmarks bar'], ['other', 'Other bookmarks'], ...bmFolders.map((f) => [f.id, (f.parent === 'other' ? 'Other bookmarks / ' : 'Bookmarks bar / ') + f.name])];
function folderSelect(sel, value) {
  sel.replaceChildren(...folderOptions().map(([v, label]) => el('option', { value: v, selected: v === value }, label)));
}
async function reloadBookmarks(r) {
  if (!r.ok) { toast(r.error); return false; }
  if (Array.isArray(r.data)) bookmarks = r.data;
  renderBookmarkBar();
  updateToolbar();
  return true;
}
// add or edit a bookmark in the same dialog (b === null adds a page by address)
function editBookmark(b) {
  const dlg = $('editdlg');
  $('ed-title').value = b ? b.title : '';
  $('ed-url').value = b ? b.url : '';
  folderSelect($('ed-folder'), b ? barOf(b) : 'bar');
  dlg.querySelector('b').textContent = b ? 'Edit bookmark' : 'Add page';
  dlg.hidden = false;
  dlg.dataset.id = b ? b.id : '';
  $('ed-title').focus();
}
async function saveBookmarkEdit() {
  const dlg = $('editdlg');
  const folder = $('ed-folder').value;
  let r;
  if (dlg.dataset.id) r = await dex.bookmarksUpdate(dlg.dataset.id, { title: $('ed-title').value, url: $('ed-url').value.trim(), folder });
  else {
    const url = $('ed-url').value.trim();
    r = await dex.bookmarksAdd({ title: $('ed-title').value.trim() || url, url });
    if (r.ok) { const made = r.data.find((x) => x.url === url); if (made && folder !== 'bar') r = await dex.bookmarksUpdate(made.id, { folder }); }
  }
  dlg.hidden = true;
  await reloadBookmarks(r);
}
// the small popup under the star (Brave: "Bookmark added")
function showBookmarkPopup(b, added) {
  closePops();
  const pop = $('bmpop');
  const name = el('input', { type: 'text', value: b.title, spellcheck: false });
  const folder = el('select');
  folderSelect(folder, barOf(b));
  const newFolder = el('button', { onclick: () => promptFolder('bar', async (id) => { const r = await dex.bmFolders(); bmFolders = r.data || bmFolders; folderSelect(folder, id); }) }, 'New folder…');
  const close = () => { pop.hidden = true; };
  pop.replaceChildren(
    el('h4', {}, added ? 'Bookmark added' : 'Edit bookmark'),
    el('label', {}, 'Name', name),
    el('label', {}, 'Folder', folder),
    el('div', { className: 'row' },
      el('button', { onclick: async () => { close(); await reloadBookmarks(await dex.bookmarksRemove(b.id)); } }, 'Remove'),
      newFolder,
      el('button', { className: 'primary', onclick: async () => { close(); await reloadBookmarks(await dex.bookmarksUpdate(b.id, { title: name.value, folder: folder.value })); } }, 'Done')));
  pop.hidden = false;
  name.focus();
  name.select();
}
function promptFolder(parent, done, rename) {
  closePops();
  const pop = $('bmpop');
  const name = el('input', { type: 'text', value: rename ? rename.name : '', placeholder: 'Folder name', spellcheck: false });
  const go = async () => {
    pop.hidden = true;
    if (rename) { const r = await dex.bmFolderRename(rename.id, name.value); if (r.ok) { bmFolders = r.data; renderBookmarkBar(); if (done) done(); } else toast(r.error); return; }
    const r = await dex.bmFolderAdd({ name: name.value, parent });
    if (r.ok) { bmFolders = r.data.folders; renderBookmarkBar(); if (done) done(r.data.id); } else toast(r.error);
  };
  name.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); if (ev.key === 'Escape') pop.hidden = true; });
  pop.replaceChildren(el('h4', {}, rename ? 'Rename folder' : 'New folder'), el('label', {}, 'Name', name),
    el('div', { className: 'row' }, el('button', { onclick: () => { pop.hidden = true; } }, 'Cancel'), el('button', { className: 'primary', onclick: go }, 'Save')));
  pop.hidden = false;
  name.focus();
}
function placeMenu(box, x, y) {
  box.style.left = Math.max(4, Math.min(x, innerWidth - 230)) + 'px';
  box.style.top = Math.min(y, innerHeight - 320) + 'px';
  box.hidden = false;
}
function barToggleItems(add) {
  add(cfg.settings.bookmarksBarMode === 'always' ? 'Show bookmarks bar only on new tab page' : 'Always show bookmarks bar', () => dex.settingsSet({ bookmarksBarMode: cfg.settings.bookmarksBarMode === 'always' ? 'newtab' : 'always' }));
  add('Hide bookmarks bar', () => dex.settingsSet({ bookmarksBar: false }));
}
function bookmarkMenu(b, x, y) {
  closePops();
  const box = $('ctx');
  box.replaceChildren();
  const add = (label, fn) => box.append(el('button', { onclick: () => { closePops(); fn(); } }, label));
  add('Open in new tab', () => createTab(b.url));
  add('Open in new window', () => dex.windowNew(false));
  add('Open in new private window', () => dex.windowNew(true));
  box.append(el('hr'));
  add('Edit…', () => editBookmark(b));
  add('Copy link address', () => { navigator.clipboard.writeText(b.url).catch(() => {}); toast('Link copied'); });
  add('Delete', async () => reloadBookmarks(await dex.bookmarksRemove(b.id)));
  box.append(el('hr'));
  add('Add page…', () => editBookmark(null));
  add('Add folder…', () => promptFolder('bar'));
  add('Bookmark manager', () => showLibrary('bookmarks'));
  box.append(el('hr'));
  barToggleItems(add);
  placeMenu(box, x, y);
}
function folderMenu(f, x, y) {
  closePops();
  const box = $('ctx');
  box.replaceChildren();
  const add = (label, fn) => box.append(el('button', { onclick: () => { closePops(); fn(); } }, label));
  const kids = bookmarks.filter((b) => b.folder === f.id);
  add('Open all (' + kids.length + ')', () => kids.forEach((k) => createTab(k.url, false)));
  add('Rename…', () => promptFolder(f.parent, null, f));
  add('Delete', async () => { const r = await dex.bmFolderRemove(f.id); if (r.ok) { bmFolders = r.data.folders; bookmarks = r.data.bookmarks; renderBookmarkBar(); updateToolbar(); } });
  box.append(el('hr'));
  add('Add page…', () => editBookmark(null));
  add('Add folder…', () => promptFolder('bar'));
  placeMenu(box, x, y);
}
// dropdown for a folder (or "Other bookmarks") under its chip on the bar
function showFolderDropdown(anchor, id) {
  closePops();
  const box = $('ctx');
  const items = [];
  for (const f of bmFolders.filter((x) => x.parent === id)) items.push(el('button', { onclick: () => showFolderDropdown(anchor, f.id) }, '📁 ' + f.name));
  for (const b of bookmarks.filter((x) => barOf(x) === id)) {
    const row = el('button', { title: b.url, onclick: () => { closePops(); go(b.url); } }, b.title);
    row.addEventListener('auxclick', (e) => { if (e.button === 1) createTab(b.url); });
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); bookmarkMenu(b, e.clientX, e.clientY); });
    items.push(row);
  }
  if (!items.length) items.push(el('button', { disabled: true }, '(empty)'));
  box.replaceChildren(...items);
  const r = anchor.getBoundingClientRect();
  box.style.maxHeight = '60vh';
  box.style.overflow = 'auto';
  placeMenu(box, r.left, r.bottom + 4);
}

let dragId = null;
function renderBookmarkBar() {
  const bar = $('bmbar');
  updateBarVisibility();
  bar.replaceChildren();
  const barItems = bookmarks.filter((b) => barOf(b) === 'bar');
  const barFolders = bmFolders.filter((f) => f.parent === 'bar');
  const hasOther = bookmarks.some((b) => barOf(b) === 'other') || bmFolders.some((f) => f.parent === 'other');
  if (!bookmarks.length && !bmFolders.length) bar.append(el('span', { className: 'hint' }, 'For quick access, place your bookmarks here on the bookmarks bar. Right-click for options.'));
  for (const f of barFolders) {
    const chip = el('button', { className: 'chip folder', title: f.name, onclick: (ev) => showFolderDropdown(ev.currentTarget, f.id) }, f.name);
    chip.addEventListener('contextmenu', (e) => { e.preventDefault(); folderMenu(f, e.clientX, e.clientY); });
    bar.append(chip);
  }
  for (const b of barItems) {
    const chip = el('button', { className: 'chip', title: b.title + '\n' + b.url, draggable: true, onclick: () => go(b.url) }, b.title);
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
  const other = el('button', { className: 'chip folder other', title: 'Other bookmarks', onclick: (ev) => showFolderDropdown(ev.currentTarget, 'other') }, 'Other bookmarks');
  if (hasOther) bar.append(other);
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
  $('bmbar').addEventListener('contextmenu', (ev) => {
    if (ev.target === $('bmbar') || ev.target.classList.contains('hint')) {
      ev.preventDefault();
      closePops();
      const box = $('ctx');
      box.replaceChildren();
      const add = (label, fn) => box.append(el('button', { onclick: () => { closePops(); fn(); } }, label));
      add('Add page…', () => editBookmark(null));
      add('Add folder…', () => promptFolder('bar'));
      add('Bookmark manager', () => showLibrary('bookmarks'));
      box.append(el('hr'));
      barToggleItems(add);
      placeMenu(box, ev.clientX, ev.clientY);
    }
  });
}
