'use strict';
// Settings page (Brave-style): sections rendered into #settings.

const SECTIONS = [
  ['appearance', 'Appearance'],
  ['shields', 'Shields'],
  ['search', 'Search engine'],
  ['startup', 'On startup'],
  ['passwords', 'Passwords'],
  ['security', 'Security & lock'],
  ['permissions', 'Site settings'],
  ['downloads', 'Downloads'],
  ['ua', 'User agent'],
  ['sync', 'Google sync'],
  ['data', 'Clear browsing data'],
  ['about', 'About DexBrowse']
];

let currentSectionId = 'appearance';
const currentSection = () => currentSectionId;

function sRow(title, desc, control) {
  return el('div', { className: 'srow' }, el('div', { className: 'l' }, el('b', {}, title), desc ? el('span', {}, desc) : null), control);
}
function sCard(title, ...rows) {
  return el('div', { className: 'card' }, title ? el('h3', {}, title) : null, ...rows);
}
function sBtn(label, fn, cls) {
  return el('button', { className: 'b ' + (cls || ''), onclick: fn }, label);
}
function sSelect(options, value, onChange) {
  const s = el('select');
  for (const [v, label] of options) s.append(el('option', { value: String(v), selected: String(v) === String(value) }, label));
  s.addEventListener('change', () => onChange(s.value));
  return s;
}
const setSetting = (patch) => dex.settingsSet(patch);

async function renderSettings(section) {
  currentSectionId = SECTIONS.some(([id]) => id === section) ? section : 'appearance';
  const root = $('settings');
  const nav = el('nav', {}, el('h1', {}, 'Settings'));
  for (const [id, label] of SECTIONS) {
    nav.append(el('button', { className: id === currentSectionId ? 'on' : '', onclick: () => renderSettings(id) }, label));
  }
  const main = el('main', {}, el('h2', {}, SECTIONS.find(([id]) => id === currentSectionId)[1]));
  root.replaceChildren(nav, main);
  const s = cfg.settings;

  switch (currentSectionId) {
    case 'appearance':
      main.append(sCard('Theme',
        sRow('Color theme', 'Dark, light, or follow your system.', sSelect([['dark', 'Dark'], ['light', 'Light'], ['system', 'Same as system']], s.theme, (v) => setSetting({ theme: v })))),
        sCard('Toolbar',
          sRow('Show bookmarks bar', 'Ctrl+Shift+B', switchEl(s.bookmarksBar, (v) => setSetting({ bookmarksBar: v})))));
      break;

    case 'shields': {
      const sh = s.shields;
      const gl = (key) => (v) => setSetting({ shields: { [key]: v } });
      main.append(sCard('Default Shields settings',
        sRow('Shields', 'Master switch for tracker, ad and cookie protection on every site.', switchEl(sh.enabled, gl('enabled'))),
        sRow('Block trackers & ads', 'Cancels requests to known advertising and tracking domains.', switchEl(sh.ads, gl('ads'))),
        sRow('Upgrade connections to HTTPS', 'Opens http:// pages over https:// when the site supports it.', switchEl(sh.https, gl('https'))),
        sRow('Block third-party cookies', 'Stops embedded sites from reading or setting cookies.', switchEl(sh.cookies, gl('cookies'))),
        sRow('Send Do Not Track and Global Privacy Control', 'Asks sites not to sell or share your data.', switchEl(sh.gpc, gl('gpc'))),
        sRow('Protect my IP address from WebRTC leaks', 'Uses only your default public network interface.', switchEl(s.webrtc, (v) => setSetting({ webrtc: v })))));
      const stats = (await dex.shieldsStats()).data || {};
      main.append(sCard('Blocked so far',
        sRow('Ads blocked', '', el('b', {}, String(stats.ads || 0))),
        sRow('Trackers blocked', '', el('b', {}, String(stats.trackers || 0))),
        sRow('Connections upgraded to HTTPS', '', el('b', {}, String(stats.upgrades || 0)))));
      const sites = (await dex.shieldsSites()).data || {};
      const names = Object.keys(sites);
      const card = sCard('Site-specific settings');
      if (!names.length) card.append(el('div', { className: 'msg' }, 'No per-site changes. Use the shield button in the toolbar to change a single site.'));
      for (const host of names) {
        const r = sites[host];
        const bits = [r.off ? 'Shields down' : null, r.ads === false ? 'ads allowed' : null, r.https === false ? 'no HTTPS upgrade' : null, r.cookies === false ? 'cookies allowed' : null, r.scripts ? 'scripts blocked' : null].filter(Boolean);
        card.append(sRow(host, bits.join(', ') || 'Custom settings', sBtn('Reset', async () => { await dex.shieldsSiteReset(host); renderSettings('shields'); })));
      }
      main.append(card);
      break;
    }

    case 'search': {
      const card = sCard('Default search engine');
      for (const name of Object.keys(cfg.engines)) {
        card.append(sRow(name, hostOf(cfg.engines[name]), sBtn(name === s.engine ? 'Default' : 'Make default', () => setSetting({ engine: name }), name === s.engine ? '' : '')));
      }
      main.append(card);
      break;
    }

    case 'startup': {
      const home = el('input', { type: 'text', value: s.homepage, placeholder: 'https://example.com' });
      home.addEventListener('change', () => setSetting({ homepage: home.value.trim() }));
      main.append(sCard('When DexBrowse starts',
        sRow('Open', '', sSelect([['start', 'The start page'], ['restore', 'Tabs from last time'], ['homepage', 'A specific page']], s.startup, (v) => setSetting({ startup: v}))),
        sRow('Homepage', 'Used when you choose "A specific page" and for the Home action.', home)));
      break;
    }

    case 'passwords': {
      main.append(sCard('Passwords',
        sRow('Offer to save passwords', PRIVNOTE(), switchEl(s.savePasswords, (v) => setSetting({ savePasswords: v }))),
        sRow('Fill saved passwords automatically', 'Fills the login form when you open a site you saved.', switchEl(s.autofill, (v) => setSetting({ autofill: v })))));
      if (!cfg.secureStorage) main.append(el('div', { className: 'card' }, el('div', { className: 'msg' }, 'Secure storage is not available on this system, so passwords cannot be saved.')));
      const res = await dex.loginsList();
      const card = sCard('Saved passwords');
      if (!res.ok) card.append(el('div', { className: 'msg' }, res.error));
      else if (!res.data.length) card.append(el('div', { className: 'msg' }, 'No saved passwords.'));
      else for (const l of res.data) {
        const shown = el('code', {}, '••••••••');
        const row = sRow(hostOf(l.origin), l.username || '(no username)', el('div', { className: 'item-line' }, shown,
          sBtn('Show', async (e) => {
            if (shown.dataset.on) { shown.textContent = '••••••••'; delete shown.dataset.on; e.target.textContent = 'Show'; return; }
            const r = await dex.loginsReveal(l.id);
            if (r.ok) { shown.textContent = r.data; shown.dataset.on = '1'; e.target.textContent = 'Hide'; } else toast(r.error);
          }),
          sBtn('Copy', async () => { const r = await dex.loginsReveal(l.id); if (r.ok) { await navigator.clipboard.writeText(r.data).catch(() => {}); toast('Password copied'); } }),
          sBtn('Delete', async () => { await dex.loginsDelete(l.id); renderSettings('passwords'); }, 'danger')));
        card.append(row);
      }
      main.append(card);
      const never = (await dex.loginsNever()).data || [];
      const nc = sCard('Never saved');
      if (!never.length) nc.append(el('div', { className: 'msg' }, 'Sites where you chose "Never" appear here.'));
      for (const o of never) nc.append(sRow(hostOf(o), '', sBtn('Remove', async () => { cfg.settings.neverSave = (await dex.loginsNeverRemove(o)).data; renderSettings('passwords'); })));
      main.append(nc);
      break;
    }

    case 'security': {
      const status = (await dex.lockStatus()).data || {};
      const cur = el('input', { type: 'password', placeholder: 'Current passcode' });
      const nw = el('input', { type: 'password', placeholder: status.enabled ? 'New passcode' : 'Passcode (4+ characters)' });
      const nw2 = el('input', { type: 'password', placeholder: 'Repeat passcode' });
      const msg = el('div', { className: 'msg' });
      const save = sBtn(status.enabled ? 'Change passcode' : 'Set passcode', async () => {
        if (nw.value !== nw2.value) { msg.textContent = 'The passcodes do not match.'; return; }
        const r = await dex.lockSet(nw.value, cur.value);
        if (!r.ok) { msg.textContent = r.error; return; }
        lockEnabled = true; toast('Passcode saved'); renderSettings('security');
      }, 'primary');
      const pass = sCard('Passcode lock',
        sRow('Lock DexBrowse with a passcode', status.enabled ? 'DexBrowse asks for the passcode on start and after auto-lock.' : 'Protects history, bookmarks, saved passwords and the open tabs.', el('span', {}, status.enabled ? 'On' : 'Off')));
      if (status.enabled) pass.append(sRow('Current passcode', '', cur));
      pass.append(sRow(status.enabled ? 'New passcode' : 'Passcode', '', nw), sRow('Confirm', '', nw2), el('div', { className: 'srow' }, save, msg));
      main.append(pass);
      if (status.enabled) {
        main.append(sCard('Lock options',
          sRow('Auto-lock after inactivity', '', sSelect([[0, 'Never'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']], s.autoLockMinutes, (v) => setSetting({ autoLockMinutes: Number(v) }))),
          sRow('Lock now', 'Ctrl+Shift+L', sBtn('Lock', () => dex.lockNow())),
          sRow('Remove passcode', 'Enter your current passcode above first.', sBtn('Remove', async () => {
            const r = await dex.lockRemove(cur.value);
            if (!r.ok) { toast(r.error); return; }
            lockEnabled = false; toast('Passcode removed'); renderSettings('security');
          }, 'danger')),
          sRow('Forgot the passcode?', 'Resets the passcode but erases saved passwords, history and bookmarks.', sBtn('Reset…', async () => {
            const r = await dex.lockReset();
            if (r.ok && r.data) { lockEnabled = false; toast('Passcode removed and data erased'); renderSettings('security'); }
          }, 'danger'))));
      }
      main.append(sCard('Private browsing',
        sRow('New private window', 'Ctrl+Shift+N. No history, cookies or saved logins are kept, and nothing is synced.', sBtn('Open', () => dex.windowNew(true)))));
      break;
    }

    case 'permissions': {
      const res = await dex.permissionsList();
      const card = sCard('Permissions you answered');
      const list = res.ok ? res.data : [];
      if (!list.length) card.append(el('div', { className: 'msg' }, 'No saved site permissions.'));
      for (const p of list) {
        card.append(sRow(p.host, `${p.permission}: ${p.allowed ? 'Allowed' : 'Blocked'}`, sBtn('Reset', async () => { await dex.permissionsRemove(p.key); renderSettings('permissions'); })));
      }
      main.append(card);
      break;
    }

    case 'downloads':
      main.append(sCard('Downloads',
        sRow('Location', 'Files are saved here.', el('code', {}, cfg.downloadsDir)),
        sRow('Ask where to save each file', '', switchEl(s.askDownload, (v) => setSetting({ askDownload: v }))),
        sRow('Downloads list', 'Ctrl+J', sBtn('Open', () => showLibrary('downloads')))));
      break;

    case 'ua': {
      const res = await dex.uaList();
      const card = sCard('Browser identity');
      if (!res.ok) card.append(el('div', { className: 'msg' }, res.error));
      else for (const name of res.data.names) {
        card.append(sRow(name, '', sBtn(name === res.data.current ? 'In use' : 'Use', async () => {
          const r = await dex.uaSet(name);
          if (!r.ok) { toast(r.error); return; }
          for (const t of tabs) if (t.ready && isWeb(t.url)) t.view.reloadIgnoringCache();
          toast('User agent: ' + name);
          renderSettings('ua');
        })));
      }
      main.append(card);
      break;
    }

    case 'sync': {
      await refreshSync();
      const card = sCard('Google account');
      if (!sync.configured) card.append(el('div', { className: 'msg' }, 'Google sync is not set up in this build.'));
      else if (!sync.signedIn) card.append(sRow('Not signed in', 'Sign in to share history between your phone and this PC.', sBtn('Sign in with Google', async () => { await signIn(); renderSettings('sync'); }, 'primary')));
      else {
        card.append(sRow('Signed in', sync.email, sBtn('Sign out', async () => { await dex.syncSignOut(); await refreshSync(); renderSettings('sync'); }, 'danger')),
          sRow('Synced history', 'See history from all your devices.', sBtn('Open', () => showLibrary('cloud'))),
          sRow('Upload this PC’s history', '', sBtn('Upload', async () => { const r = await dex.syncUpload(); toast(r.ok ? 'History uploaded' : r.error); })));
      }
      main.append(card);
      break;
    }

    case 'data': {
      const checks = {};
      const opts = [['history', 'Browsing history', true], ['cookies', 'Cookies and other site data', true], ['cache', 'Cached images and files', true],
        ['downloads', 'Download list', false], ['logins', 'Saved passwords', false], ['sites', 'Site permissions and Shields overrides', false]];
      const card = sCard('Choose what to clear');
      for (const [key, label, def] of opts) {
        checks[key] = def;
        card.append(sRow(label, '', switchEl(def, (v) => { checks[key] = v; })));
      }
      card.append(el('div', { className: 'srow' }, sBtn('Clear data', async () => {
        const r = await dex.dataClear(checks);
        toast(r.ok ? 'Browsing data cleared' : r.error);
        await refreshBookmarks();
      }, 'primary')));
      main.append(card);
      break;
    }

    case 'about': {
      main.append(sCard('DexBrowse By Fuad',
        sRow('Version', '', el('b', {}, cfg.version)),
        sRow('Chromium', '', el('b', {}, cfg.chrome)),
        sRow('Electron', '', el('b', {}, cfg.electron))));
      const keys = [['Ctrl+T', 'New tab'], ['Ctrl+W', 'Close tab'], ['Ctrl+Shift+T', 'Reopen closed tab'], ['Ctrl+Tab', 'Next tab'], ['Ctrl+1–9', 'Go to tab'],
        ['Ctrl+N', 'New window'], ['Ctrl+Shift+N', 'New private window'], ['Ctrl+L', 'Address bar'], ['Ctrl+D', 'Bookmark page'],
        ['Ctrl+F', 'Find in page'], ['Ctrl+P', 'Print'], ['Ctrl+H', 'History'], ['Ctrl+J', 'Downloads'], ['Ctrl+Shift+O', 'Bookmarks'],
        ['Ctrl+Shift+S', 'Reading list'], ['Ctrl+Shift+B', 'Bookmarks bar'], ['Ctrl+Shift+L', 'Lock'], ['Ctrl+ +/-/0', 'Zoom'],
        ['Alt+←/→', 'Back / Forward'], ['F12', 'Developer tools'], ['Ctrl+,', 'Settings']];
      const grid = el('div', { className: 'kbd' });
      for (const [k, d] of keys) grid.append(el('div', {}, el('b', {}, k), d));
      main.append(sCard('Keyboard shortcuts', grid));
      break;
    }
  }
}

function PRIVNOTE() {
  return 'Passwords are encrypted with your operating system’s secure storage. Not saved in private windows.';
}

boot();
