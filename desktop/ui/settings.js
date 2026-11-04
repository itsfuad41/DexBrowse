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
  ['profiles', 'Profiles'],
  ['extensions', 'Extensions'],
  ['performance', 'Performance & memory'],
  ['ua', 'User agent'],
  ['sync', 'Google sync'],
  ['import', 'Import from another browser'],
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
// password-type input with a Show/Hide toggle, so a passcode or recovery phrase can be checked while typing
function secretInput(placeholder) {
  const input = el('input', { type: 'password', placeholder, autocomplete: 'off' });
  const toggle = el('button', { className: 'b', type: 'button', title: 'Show or hide' }, 'Show');
  toggle.addEventListener('click', () => {
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    toggle.textContent = hidden ? 'Hide' : 'Show';
  });
  const wrap = el('span', { style: 'display:inline-flex;gap:4px;align-items:center' }, input, toggle);
  wrap.input = input;
  return wrap;
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
function comboOf(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (key === ' ') key = 'Space';
  parts.push(key);
  return parts.join('+');
}

async function renderSettings(section) {
  currentSectionId = SECTIONS.some(([id]) => id === section) ? section : 'appearance';
  const root = $('settings');
  const nav = el('nav', {}, el('button', { className: 'back', onclick: closeSettings }, '← Back to browser'), el('h1', {}, 'Settings'));
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
          sRow('Show bookmarks bar', 'Ctrl+Shift+B', switchEl(s.bookmarksBar, (v) => setSetting({ bookmarksBar: v}))),
          sRow('Bookmarks bar shows', 'Drag bookmarks to reorder them, right-click to edit or delete.', sSelect([['always', 'On every page'], ['newtab', 'Only on the new tab page']], s.bookmarksBarMode, (v) => setSetting({ bookmarksBarMode: v})))));
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
      main.append(sCard('Address bar',
        sRow('Show search suggestions', 'While you type, DexBrowse asks your search engine for suggestions (Brave, Google, DuckDuckGo and Bing). Bookmarks and history are always suggested locally.', switchEl(s.searchSuggest, (v) => setSetting({ searchSuggest: v })))));
      break;
    }

    case 'performance': {
      main.append(sCard('Memory saver',
        sRow('Put unused tabs to sleep', 'Tabs you have not looked at for a while are unloaded and reload when you click them. Pinned tabs, tabs playing sound and the current tab are never put to sleep.', switchEl(s.memorySaver, (v) => setSetting({ memorySaver: v }))),
        sRow('Sleep tabs after', '', sSelect([[5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']], s.sleepMinutes, (v) => setSetting({ sleepMinutes: Number(v) })))));
      main.append(sCard('Also reducing memory',
        sRow('Fewer browser processes', 'DexBrowse limits the number of page processes and the disk cache size automatically.', null),
        sRow('Close what you do not need', 'Each profile you open and each private window runs its own browser process.', null)));
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
      const audit = ((await dex.loginsAudit()).data) || { reused: [], weak: [] };
      const reused = new Set(audit.reused);
      const weak = new Set(audit.weak);
      const all = res.ok ? res.data : [];
      const card = sCard('Saved passwords');
      main.append(card);
      if (!res.ok) card.append(el('div', { className: 'msg' }, res.error));
      else {
        const summary = el('div', { className: 'pwsum' },
          el('span', { className: 'chip' }, `${all.length} saved`),
          reused.size ? el('button', { className: 'chip warn', onclick: () => { filter = filter === 'reused' ? 'all' : 'reused'; draw(); } }, `${reused.size} reused`) : null,
          weak.size ? el('button', { className: 'chip bad', onclick: () => { filter = filter === 'weak' ? 'all' : 'weak'; draw(); } }, `${weak.size} weak`) : (all.length ? el('span', { className: 'chip ok' }, 'No weak passwords') : null),
          el('span', { style: 'flex:1' }),
          sBtn('Import', async () => { const r = await dex.importFile('passwords'); if (r.ok && r.data) { toast(`Imported ${r.data.passwords} passwords`); renderSettings('passwords'); } else if (!r.ok) toast(r.error); }),
          sBtn('Export', async () => { const r = await dex.loginsExport(); if (r.ok && r.data) toast('Saved to ' + r.data); else if (!r.ok) toast(r.error); }));
        const search = el('input', { type: 'search', className: 'pwsearch', placeholder: 'Search sites and usernames' });
        const addBtn = sBtn('Add password', () => openForm(null), 'primary');
        card.append(el('div', { className: 'pwtools' }, search, addBtn), summary);
        const formBox = el('div', {});
        const list = el('div', { className: 'pwlist' });
        card.append(formBox, list);

        const openForm = (item) => {
          formBox.innerHTML = '';
          const site = el('input', { type: 'text', placeholder: 'Website (example.com)', value: item ? item.origin : '', disabled: !!item });
          const user = el('input', { type: 'text', placeholder: 'Username or email', value: item ? item.username : '', autocomplete: 'off' });
          const pass = secretInput(item ? 'New password (leave empty to keep)' : 'Password');
          const input = pass.input;
          const gen = sBtn('Generate', async () => { const r = await dex.loginsGenerate(); if (r.ok && input) { input.value = r.data; input.type = 'text'; } }, '');
          const save = sBtn(item ? 'Save changes' : 'Save', async () => {
            const pw = input ? input.value : '';
            const r = item ? await dex.loginsUpdate({ id: item.id, username: user.value, password: pw })
              : await dex.loginsAdd({ site: site.value, username: user.value, password: pw });
            if (!r.ok) { toast(r.error); return; }
            renderSettings('passwords');
          }, 'primary');
          formBox.append(el('div', { className: 'pwform' }, el('b', {}, item ? 'Edit password' : 'Add a password'), site, user, pass, el('div', { className: 'item-line' }, gen, sBtn('Cancel', () => { formBox.innerHTML = ''; }), save)));
          (item ? user : site).focus();
        };

        let filter = 'all';
        const draw = () => {
          list.innerHTML = '';
          const q = search.value.trim().toLowerCase();
          const shown = all.filter((l) => (!q || hostOf(l.origin).toLowerCase().includes(q) || (l.username || '').toLowerCase().includes(q))
            && (filter === 'all' || (filter === 'reused' && reused.has(l.id)) || (filter === 'weak' && weak.has(l.id))))
            .sort((a, b) => hostOf(a.origin).localeCompare(hostOf(b.origin)));
          if (!shown.length) { list.append(el('div', { className: 'msg' }, all.length ? 'Nothing matches.' : 'No saved passwords yet. Sign in to a site and choose Save, or add one here.')); return; }
          list.append(el('div', { className: 'pwhead' }, el('span', {}, 'Website'), el('span', {}, 'Username'), el('span', {}, 'Password'), el('span', {})));
          for (const l of shown) {
            const dots = el('span', { className: 'pwdots' }, '••••••••••');
            const eye = el('button', { className: 'b pweye', title: 'Show password' }, '👁');
            eye.addEventListener('click', async () => {
              if (dots.dataset.on) { dots.textContent = '••••••••••'; delete dots.dataset.on; return; }
              const r = await dex.loginsReveal(l.id);
              if (r.ok) { dots.textContent = r.data; dots.dataset.on = '1'; } else toast(r.error);
            });
            const more = el('button', { className: 'b pwmore', title: 'More actions' }, '⋮');
            more.addEventListener('click', (e) => {
              const box = $('ctx');
              const add = (label, fn) => box.append(el('button', { onclick: () => { closePops(); fn(); } }, label));
              closePops(); box.replaceChildren();
              add('Copy password', async () => { const r = await dex.loginsReveal(l.id); if (r.ok) { await navigator.clipboard.writeText(r.data).catch(() => {}); toast('Password copied'); } });
              add('Copy username', async () => { await navigator.clipboard.writeText(l.username || '').catch(() => {}); toast('Username copied'); });
              add('Edit', () => openForm(l));
              add('Open site', () => createTab(l.origin));
              box.append(el('hr'));
              add('Remove', async () => { await dex.loginsDelete(l.id); renderSettings('passwords'); });
              const r = e.currentTarget.getBoundingClientRect();
              box.style.left = Math.max(4, r.right - 190) + 'px'; box.style.top = r.bottom + 4 + 'px'; box.hidden = false;
            });
            list.append(el('div', { className: 'pwrow2' },
              el('span', { className: 'pwsite2' }, el('span', { className: 'pwav' }, hostOf(l.origin).replace(/^www\./, '')[0].toUpperCase()), el('span', { className: 'pwhost' }, hostOf(l.origin)),
                reused.has(l.id) ? el('span', { className: 'chip warn' }, 'Reused') : null, weak.has(l.id) ? el('span', { className: 'chip bad' }, 'Weak') : null),
              el('span', { className: 'pwuser' }, l.username || '—'),
              el('span', { className: 'pwpass' }, dots, eye),
              more));
          }
        };
        search.addEventListener('input', draw);
        draw();
      }
      const never = (await dex.loginsNever()).data || [];
      const nc = sCard('Never saved');
      if (!never.length) nc.append(el('div', { className: 'msg' }, 'Sites where you chose "Never" appear here.'));
      for (const o of never) nc.append(sRow(hostOf(o), '', sBtn('Remove', async () => { cfg.settings.neverSave = (await dex.loginsNeverRemove(o)).data; renderSettings('passwords'); })));
      main.append(nc);
      break;
    }

    case 'security': {
      if (cfg.guest) { main.append(sCard('Guest browser', sRow('No lock in guest mode', 'The guest browser keeps nothing and is deleted when closed.', null))); break; }
      const kbd = el('button', { className: 'b kbdbtn' }, s.lockShortcut);
      kbd.addEventListener('click', () => {
        kbd.textContent = 'Press the keys…';
        kbd.classList.add('rec');
        const onKey = async (e) => {
          if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
          document.removeEventListener('keydown', onKey, true);
          kbd.classList.remove('rec');
          if (e.key === 'Escape') { kbd.textContent = cfg.settings.lockShortcut; return; }
          const combo = comboOf(e);
          const r = await setSetting({ lockShortcut: combo });
          if (!r.ok) toast(r.error);
          else {
            cfg.settings = r.data;
            if (r.data.lockShortcut !== combo) toast('That shortcut cannot be used. Use Ctrl+Shift or Ctrl+Alt with a letter, digit or F-key.');
          }
          kbd.textContent = cfg.settings.lockShortcut;
        };
        document.addEventListener('keydown', onKey, true);
      });
      main.append(sCard('Lock',
        sRow('Lock with your profile passcode', 'Locking hides the browser until you enter the passcode of this profile. Change the passcode in Profiles.', sBtn('Lock now', () => dex.lockNow(), 'primary')),
        sRow('Auto-lock after inactivity', 'Locks automatically when you stop using DexBrowse.',
          sSelect([[0, 'Never'], [1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']], s.autoLockMinutes, (v) => setSetting({ autoLockMinutes: Number(v) }))),
        sRow('Lock shortcut', 'Click, then press the keys you want (Ctrl or Alt with Shift, a letter or an F-key).',
          el('div', { style: 'display:flex;gap:6px' }, kbd, sBtn('Reset', async () => { await setSetting({ lockShortcut: 'Ctrl+Shift+L' }); renderSettings('security'); })))));
      main.append(sCard('Passcode', sRow('Change passcode or recovery phrase', '', sBtn('Open Profiles', () => renderSettings('profiles')))));
      main.append(sCard('Private browsing',
        sRow('New private window', 'Ctrl+Shift+N. No history, cookies or saved logins are kept, and nothing is synced.', sBtn('Open', () => dex.windowNew(true)))));
      break;
    }

    case 'permissions': {
      const pm = s.perm;
      const sel = (key, opts) => sSelect(opts, pm[key], async (v) => { const r = await setSetting({ perm: { [key]: v } }); if (r.ok) cfg.settings = r.data; });
      main.append(sCard('Notifications, calls and sound',
        sRow('Notifications', 'Sites can only show notifications after you allow them. They appear as system notifications.', sel('notifications', [['ask', 'Ask me'], ['block', 'Block all']])),
        sRow('Microphone', 'For calls and voice messages.', sel('microphone', [['ask', 'Ask me'], ['allow', 'Allow on every site'], ['block', 'Block all']])),
        sRow('Camera', 'For video calls.', sel('camera', [['ask', 'Ask me'], ['allow', 'Allow on every site'], ['block', 'Block all']])),
        sRow('Speaker selection', 'Lets call sites choose which speaker or headset plays the sound.', sel('speaker', [['allow', 'Allow on every site'], ['ask', 'Ask me'], ['block', 'Block all']]))));
      const label = { notifications: 'Notifications', microphone: 'Microphone', camera: 'Camera', speaker: 'Speaker selection', media: 'Camera / microphone', midi: 'MIDI devices', 'clipboard-read': 'Clipboard', 'display-capture': 'Screen sharing' };
      const res = await dex.permissionsList();
      const card = sCard('Sites you answered');
      const list = res.ok ? res.data : [];
      if (!list.length) card.append(el('div', { className: 'msg' }, 'No saved site permissions.'));
      for (const p of list) {
        card.append(sRow(p.host, `${label[p.permission] || p.permission}: ${p.allowed ? 'Allowed' : 'Blocked'}`, sBtn('Reset', async () => { await dex.permissionsRemove(p.key); renderSettings('permissions'); })));
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
          cfg.settings.ua = name;
          paintUABtn();
          toast('User agent: ' + name + '. Open pages are not reloaded; reload a tab to use it.');
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
      else if (!sync.signedIn) card.append(sRow('Not signed in', 'Sign in to share history between your phone and this PC. Sign-in opens in a DexBrowse window.', sBtn('Sign in with Google', async () => { await signIn(false); renderSettings('sync'); }, 'primary')),
        sRow('Sign-in window blocked by Google?', 'Use your system browser instead.', sBtn('Use system browser', async () => { await signIn(true); renderSettings('sync'); })));
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

    case 'profiles': {
      const me = cfg.profile;
      if (cfg.guest) { main.append(sCard('Guest browser', sRow('Nothing is saved', 'This is a guest session. Its data is deleted when you close it.', null))); break; }
      const nameBox = el('input', { value: me.name, maxLength: 40, style: 'width:180px' });
      const colors = ['#FB542B', '#A855F7', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#14B8A6', '#64748B'];
      const sw = el('div', { className: 'swatches' });
      const paint = () => { sw.replaceChildren(...colors.map((c) => el('button', { className: c === cfg.profile.color ? 'on' : '', style: `background:${c}`, onclick: async () => { const u = await dex.profilesUpdate({ color: c }); if (u.ok) { cfg.profile = Object.assign(cfg.profile, u.data); paintProfileButton(); paint(); } } }))); };
      paint();
      main.append(sCard('This profile',
        sRow('Name', 'Other profiles are never shown here. You only manage the profile you opened with its passcode.',
          el('div', { style: 'display:flex;gap:6px' }, nameBox, sBtn('Save', async () => { const u = await dex.profilesUpdate({ name: nameBox.value }); if (u.ok) { cfg.profile = Object.assign(cfg.profile, u.data); paintProfileButton(); toast('Saved'); } else toast(u.error); }))),
        sRow('Color', '', sw),
        sRow('Switch profile', 'Opens the passcode screen. The passcode you type decides which profile opens.', sBtn('Switch…', () => dex.profilesSwitch(), 'primary'))));

      const oldW = secretInput('Current passcode'), newW = secretInput('New passcode'), recW = secretInput('New recovery phrase');
      const oldP = oldW.input, newP = newW.input, rec = recW.input;
      main.append(sCard('Passcode',
        sRow('Change passcode', 'Any length. It must differ from the passcodes of your other profiles.', el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, oldW, newW,
          sBtn('Change', async () => { const r = await dex.profilesChangePasscode(oldP.value, newP.value); toast(r.ok ? 'Passcode changed' : r.error); if (r.ok) { oldP.value = ''; newP.value = ''; } }))),
        sRow('Recovery phrase', me.hasRecovery ? 'A recovery phrase is set. Enter a new one to replace it.' : 'Lets you reset a forgotten passcode from the passcode screen.',
          el('div', { style: 'display:flex;gap:6px' }, recW, sBtn('Save', async () => { const r = await dex.profilesUpdate({ recovery: rec.value }); toast(r.ok ? 'Recovery phrase saved' : r.error); if (r.ok) { rec.value = ''; cfg.profile.hasRecovery = true; } })))));

      const aName = el('input', { placeholder: 'Profile name', maxLength: 40 });
      const aPassW = secretInput('Passcode'), aRecW = secretInput('Recovery phrase (optional)');
      const aPass = aPassW.input, aRec = aRecW.input;
      main.append(sCard('Add a profile',
        sRow('New profile', 'It will not appear in any list. Open it later by typing its passcode on the passcode screen.',
          el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, aName, aPassW, aRecW,
            sBtn('Create', async () => { const r = await dex.profilesAdd({ name: aName.value, passcode: aPass.value, recovery: aRec.value }); toast(r.ok ? 'Profile created. Use Switch profile and enter its passcode.' : r.error); if (r.ok) { aName.value = ''; aPass.value = ''; aRec.value = ''; } }, 'primary')))));

      const delP = el('input', { type: 'password', placeholder: 'Passcode to confirm' });
      main.append(sCard('Delete this profile',
        sRow('Delete', 'Removes this profile and all its history, bookmarks, logins and extensions. DexBrowse will close.',
          el('div', { style: 'display:flex;gap:6px' }, delP, sBtn('Delete profile', async () => { if (!confirm(`Delete the profile “${me.name}” and all its data?`)) return; const r = await dex.profilesDelete(delP.value); if (!r.ok) toast(r.error); }, 'danger')))));
      break;
    }

    case 'extensions': {
      const list = PRIV ? [] : ((await dex.extensionsList()).data || []);
      const card = sCard('Installed extensions');
      if (!list.length) card.append(el('div', { className: 'srow' }, el('div', { className: 'l' }, el('span', {}, PRIV ? 'Extensions are disabled in private windows.' : 'No extensions installed yet.'))));
      for (const x of list) {
        card.append(sRow(x.name, 'v' + x.version + (x.description ? ' · ' + x.description : ''),
          el('div', { className: 'item-line' },
            x.hasOptions && x.enabled ? sBtn('Options', () => openExtOptions(x)) : null,
            switchEl(x.enabled, async (v) => { const r = await dex.extensionsToggle(x.id, v); if (!r.ok) toast(r.error); refreshExtButton(); }),
            sBtn('Remove', async () => { await dex.extensionsRemove(x.id); toast('Removed'); refreshExtButton(); renderSettings('extensions'); }, 'danger'))));
      }
      main.append(card);
      const idInput = el('input', { placeholder: 'Web Store link or 32-letter ID', style: 'width:280px' });
      main.append(sCard('Add extension',
        sRow('Chrome Web Store', 'Paste an extension link or ID, or open the store and press “Add to DexBrowse”.', idInput),
        el('div', { className: 'srow', style: 'gap:8px;flex-wrap:wrap' },
          sBtn('Install', async () => { if (await installFromStore(idInput.value)) renderSettings('extensions'); }, 'primary'),
          sBtn('Open Chrome Web Store', () => { closeSettings(); createTab('https://chromewebstore.google.com/'); }),
          sBtn('Install .crx / .zip…', async () => { const r = await dex.extensionsInstallFile(); if (r.ok && r.data) renderSettings('extensions'); else if (!r.ok) toast(r.error); }),
          sBtn('Load unpacked…', async () => { const r = await dex.extensionsInstallUnpacked(); if (r.ok && r.data) renderSettings('extensions'); else if (!r.ok) toast(r.error); }))));
      main.append(el('p', { className: 'extnote' }, 'DexBrowse is built on Electron, which implements a subset of the Chrome extension APIs. Most content-script extensions work; extensions that rely on toolbar popups, side panels or newer APIs may not.'));
      break;
    }

    case 'import': {
      if (PRIV) { main.append(sCard('Import', sRow('Not available in private windows', '', null))); break; }
      const found = (await dex.importDetect()).data || [];
      const card = sCard('Browsers found on this computer');
      if (!found.length) card.append(el('div', { className: 'msg' }, 'No other browser profiles were found. You can still import files below.'));
      for (const f of found) {
        const wb = el('input', { type: 'checkbox', checked: true });
        const wh = el('input', { type: 'checkbox', checked: true });
        card.append(sRow(`${f.browser} – ${f.name}`, 'If the browser is open, close it first so its history can be read.',
          el('div', { className: 'item-line' },
            el('label', {}, wb, ' Bookmarks'), el('label', {}, wh, ' History'),
            sBtn('Import', async (e) => {
              e.target.disabled = true;
              const r = await dex.importRun({ id: f.id, bookmarks: wb.checked, history: wh.checked });
              e.target.disabled = false;
              if (r.ok) { toast(`Imported ${r.data.bookmarks} bookmarks and ${r.data.history} history entries`); await refreshBookmarks(); } else toast(r.error);
            }, 'primary'))));
      }
      main.append(card);
      main.append(sCard('From a file',
        sRow('Passwords (.csv)', 'In the other browser open its password manager and use “Export passwords”, then choose that file here. Delete the file afterwards because it is not encrypted.',
          sBtn('Choose file…', async () => { const r = await dex.importFile('passwords'); if (r.ok && r.data) toast(`Imported ${r.data.passwords} passwords`); else if (!r.ok) toast(r.error); }, 'primary')),
        sRow('Bookmarks (.html)', 'Works with the bookmarks file exported by any browser.',
          sBtn('Choose file…', async () => { const r = await dex.importFile('bookmarks'); if (r.ok && r.data) { toast(`Imported ${r.data.bookmarks} bookmarks`); await refreshBookmarks(); } else if (!r.ok) toast(r.error); }))));
      break;
    }

    case 'about': {
      const upText = el('span', {}, 'Version ' + cfg.version);
      const showUp = (u) => {
        upText.textContent = ({ checking: 'Checking…', none: 'You have the latest version.', dev: u.message, error: 'Update check failed: ' + (u.message || ''),
          downloading: `Downloading ${u.version}… ${u.percent || 0}%`, ready: `Version ${u.version} is ready to install.`, idle: 'Version ' + cfg.version })[u.state] || '';
      };
      window.onUpdateState = showUp;
      const upBtn = el('span', { style: 'display:flex;gap:6px' },
        sBtn('Check for updates', async () => { showUp({ state: 'checking' }); const r = await dex.updateCheck(); if (r.ok) showUp(r.data); }, 'primary'),
        sBtn('Restart to update', () => dex.updateInstall()));
      main.append(sCard('Updates',
        sRow('Update automatically', 'DexBrowse checks GitHub for new versions, downloads them in the background and installs on restart.', switchEl(s.autoUpdate !== false, (v) => setSetting({ autoUpdate: v }))),
        sRow('DexBrowse updates', '', upBtn)));
      dex.updateStatus().then((r) => { if (r.ok) showUp(r.data); });
      main.querySelector('.srow:last-child .l').append(upText);

      const logBox = el('pre', { className: 'updlog', hidden: true });
      main.append(el('div', { className: 'card' }, el('div', { className: 'srow' }, el('div', { className: 'l' }, el('b', {}, 'Update log'), el('span', {}, 'Shows what the updater did, useful if an update fails.')),
        sBtn('Show log', async (e) => { logBox.hidden = !logBox.hidden; if (!logBox.hidden) { const r = await dex.updateLog(); logBox.textContent = r.ok ? r.data : r.error; } e.target.textContent = logBox.hidden ? 'Show log' : 'Hide log'; })), logBox));

      const mail = 'itsfuad.41@outlook.com';
      main.append(el('div', { className: 'devwrap' },
        el('div', { className: 'devcard' },
          el('h3', {}, cfg.developer),
          el('div', { className: 'devsub' }, 'Get in touch'),
          el('div', { className: 'devrow' },
            el('a', { className: 'devmail', href: '#', onclick: (e) => { e.preventDefault(); dex.openExternal('mailto:' + mail); } }, iconEl('mail', 'devic'), mail),
            el('div', { className: 'devbtns' },
              el('button', { className: 'devib', title: 'Copy email', onclick: () => { navigator.clipboard.writeText(mail).catch(() => {}); toast('Email copied'); } }, iconEl('card', 'devico')),
              el('button', { className: 'devib', title: 'Send a message', onclick: () => dex.openExternal('mailto:' + mail + '?subject=DexBrowse') }, iconEl('chat', 'devico'))))),
        el('div', { className: 'devpill' }, 'Made By Fuad')));

      main.append(el('div', { className: 'card brandrow' }, el('img', { src: 'icon.png', alt: '' }),
        el('div', {}, el('h3', { style: 'margin:0' }, 'DexBrowse By Fuad'), el('span', { style: 'color:var(--muted)' }, 'A private, Chromium-based browser'))));
      main.append(sCard('Information',
        sRow('Developer', '', el('b', {}, cfg.developer)),
        sRow('Brand', '', el('b', {}, 'DexBrowse By Fuad')),
        sRow('Profile', '', el('b', {}, cfg.profile.name)),
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
