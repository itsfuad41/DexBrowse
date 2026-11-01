const {
  app, BrowserWindow, ipcMain, session, shell, dialog, Menu, webContents, nativeTheme, clipboard, safeStorage
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');
const sync = require('./sync');
const makeUserAgents = require('./uas');
const { createShields } = require('./shields');
const { createExtensions } = require('./extensions');

// Look like a normal browser to bot checks (navigator.webdriver stays false).
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// ---------- profiles: each profile is its own data folder and its own browser process ----------
const ROOT_DIR = app.getPath('userData');
const PROFILE_COLORS = ['#FB542B', '#A855F7', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#14B8A6', '#64748B'];
const profilesFile = path.join(ROOT_DIR, 'profiles.json');

function readProfiles() {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(profilesFile, 'utf8')).profiles || []; } catch (_) { list = []; }
  if (!list.some((p) => p.id === 'default')) list.unshift({ id: 'default', name: 'Default', color: PROFILE_COLORS[0] });
  return list;
}
function writeProfiles(list) {
  try {
    fs.mkdirSync(ROOT_DIR, { recursive: true });
    fs.writeFileSync(profilesFile, JSON.stringify({ profiles: list }));
  } catch (_) { /* ignore */ }
}
const profileArg = (process.argv.find((a) => a.startsWith('--profile=')) || '').slice('--profile='.length);
const PROFILE_ID = /^[a-z0-9-]{1,40}$/.test(profileArg) ? profileArg : 'default';
if (PROFILE_ID !== 'default') app.setPath('userData', path.join(ROOT_DIR, 'Profiles', PROFILE_ID));
const currentProfile = () => readProfiles().find((p) => p.id === PROFILE_ID) || readProfiles()[0];

const APP_ICON = path.join(__dirname, 'build', 'icon.png');
const DEVELOPER = 'Md. Fuad Hasan';

// Present as plain Chromium: drop the "Electron/x" and app-name tokens.
const cleanUA = app.userAgentFallback.replace(/\s(?:Electron|dexbrowse-desktop|DexBrowse)\/\S+/gi, '');
app.userAgentFallback = cleanUA;

const userAgents = makeUserAgents(process.versions.chrome.split('.')[0]);
const PARTITION = 'persist:browse';
const PRIVATE_PARTITION = 'private';

const ENGINES = {
  'Brave Search': 'https://search.brave.com/search?q=',
  Google: 'https://www.google.com/search?q=',
  DuckDuckGo: 'https://duckduckgo.com/?q=',
  Bing: 'https://www.bing.com/search?q=',
  Startpage: 'https://www.startpage.com/do/search?q=',
  Ecosia: 'https://www.ecosia.org/search?q=',
  Perplexity: 'https://www.perplexity.ai/search?q=',
  Yahoo: 'https://search.yahoo.com/search?p='
};

// ---------- JSON stores ----------
const file = (name) => path.join(app.getPath('userData'), name);
function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch (_) {
    return fallback;
  }
}
function writeJson(name, value) {
  try {
    fs.writeFileSync(file(name), JSON.stringify(value));
  } catch (_) {
    /* disk full or read-only: keep running */
  }
}

const DEFAULTS = {
  ua: 'This browser (default)',
  theme: 'dark',
  engine: 'Brave Search',
  startup: 'start', // start | restore | homepage
  homepage: '',
  bookmarksBar: true,
  askDownload: false,
  webrtc: true,
  autofill: true,
  savePasswords: true,
  autoLockMinutes: 0,
  neverSave: [],
  lock: null,
  shields: { enabled: true, ads: true, https: true, cookies: true, gpc: true }
};

let settings = JSON.parse(JSON.stringify(DEFAULTS));
let history = [];
let bookmarks = [];
let reading = [];
let logins = [];
let siteRules = {};
let stats = { ads: 0, trackers: 0, scripts: 0, upgrades: 0 };
let decisions = {};
let downloads = [];
const privDecisions = new Map();
const dlItems = new Map();
let dlSeq = 0;

let locked = false;
let lastActivity = Date.now();
let failures = 0;
let blockedUntil = 0;

const publicSettings = () => {
  const copy = JSON.parse(JSON.stringify(settings));
  delete copy.lock;
  return copy;
};
const saveSettings = () => writeJson('settings.json', settings);

function sanitize(patch) {
  const out = {};
  const bool = (k) => { if (typeof patch[k] === 'boolean') out[k] = patch[k]; };
  if (['dark', 'light', 'system'].includes(patch.theme)) out.theme = patch.theme;
  if (patch.engine in ENGINES) out.engine = patch.engine;
  if (['start', 'restore', 'homepage'].includes(patch.startup)) out.startup = patch.startup;
  if (typeof patch.homepage === 'string') out.homepage = patch.homepage.slice(0, 500);
  if ([0, 5, 15, 30, 60].includes(patch.autoLockMinutes)) out.autoLockMinutes = patch.autoLockMinutes;
  ['bookmarksBar', 'askDownload', 'webrtc', 'autofill', 'savePasswords'].forEach(bool);
  if (patch.shields && typeof patch.shields === 'object') {
    out.shields = {};
    for (const k of ['enabled', 'ads', 'https', 'cookies', 'gpc']) {
      if (typeof patch.shields[k] === 'boolean') out.shields[k] = patch.shields[k];
    }
  }
  return out;
}

// ---------- windows ----------
const wins = new Map(); // renderer webContents.id -> { win, priv }
const hostOf = (wc) => wc.hostWebContents || wc;
const isPriv = (wc) => {
  const entry = wins.get(hostOf(wc).id);
  return !!(entry && entry.priv);
};
const winOf = (wc) => {
  const entry = wins.get(hostOf(wc).id);
  return entry ? entry.win : null;
};

function broadcast(channel, data, privFilter) {
  for (const { win, priv } of wins.values()) {
    if (privFilter !== undefined && priv !== privFilter) continue;
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  }
}

// ---------- user agent ----------
const currentUA = () => userAgents[settings.ua] || cleanUA;
const sessions = () => [session.fromPartition(PARTITION), session.fromPartition(PRIVATE_PARTITION)];
const hostPlatform = () => (process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux');
const uaMeta = () => makeUserAgents.metadataFor(currentUA(), process.versions.chrome, hostPlatform());
const acceptLanguages = () => [...new Set([String(app.getLocale() || 'en-US').replace('_', '-'), 'en-US', 'en'])].join(',');

// Chromium sends no client hints once the UA is overridden, and real Chrome never omits them.
// Re-announce them (brand "Google Chrome", platform, languages) so sites do not see a bot.
function applyUAOverride(contents) {
  const meta = uaMeta();
  try {
    if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
  } catch (_) {
    return;
  }
  const params = { userAgent: currentUA(), acceptLanguage: acceptLanguages() };
  if (meta) {
    params.platform = meta.navPlatform;
    params.userAgentMetadata = meta.metadata;
  }
  contents.debugger.sendCommand('Emulation.setUserAgentOverride', params).catch(() => {});
}

function decorateHeaders(headers, reqUrl) {
  const meta = uaMeta();
  if (!meta) return;
  const secure = reqUrl.protocol === 'https:' || reqUrl.hostname === 'localhost' || reqUrl.hostname === '127.0.0.1';
  if (!secure) return;
  for (const [k, v] of Object.entries(meta.headers)) if (!headers[k]) headers[k] = v;
}

function applyUserAgent() {
  for (const ses of sessions()) ses.setUserAgent(currentUA(), acceptLanguages());
  for (const contents of webContents.getAllWebContents()) {
    if (contents.getType() === 'webview') {
      contents.setUserAgent(currentUA(), acceptLanguages());
      applyUAOverride(contents);
    }
  }
}

// ---------- Shields ----------
const counts = new Map();
const lastSent = new Map();
const shields = createShields({
  decorateHeaders: (headers, url) => decorateHeaders(headers, url),
  getSettings: () => settings,
  getSiteRules: () => siteRules,
  onBlocked({ id, kind }) {
    counts.set(id, (counts.get(id) || 0) + 1);
    if (kind === 'ad') stats.ads++;
    else if (kind === 'tracker') stats.trackers++;
    else stats.scripts++;
    // Trailing throttle: always deliver the latest count shortly after a burst.
    if (lastSent.get(id)) return;
    lastSent.set(id, setTimeout(() => {
      lastSent.delete(id);
      const guest = webContents.fromId(id);
      if (guest && !guest.isDestroyed()) {
        const host = hostOf(guest);
        if (host !== guest) host.send('blocked', { id, count: counts.get(id) || 0 });
      }
    }, 120));
  },
  onUpgrade() {
    stats.upgrades++;
  }
});
setInterval(() => writeJson('stats.json', stats), 10000).unref();

// ---------- permissions ----------
const AUTO_ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'window-management']);
const ASK = {
  media: 'use your camera and/or microphone',
  notifications: 'show notifications',
  midi: 'use MIDI devices',
  'clipboard-read': 'read your clipboard',
  'display-capture': 'share your screen'
};

function setupSession(ses, priv) {
  shields.attach(ses);

  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    if (AUTO_ALLOW.has(permission)) return callback(true);
    if (!ASK[permission]) return callback(false);
    let host = 'This site';
    try {
      host = new URL(details.requestingUrl).host;
    } catch (_) {
      /* keep default */
    }
    const key = `${host}|${permission}`;
    const known = priv ? privDecisions.get(key) : decisions[key];
    if (known !== undefined) return callback(known);
    const { response } = await dialog.showMessageBox(winOf(wc) || undefined, {
      type: 'question',
      buttons: ['Allow', 'Block'],
      defaultId: 1,
      cancelId: 1,
      title: 'Permission request',
      message: `${host} wants to ${ASK[permission]}.`
    });
    const allowed = response === 0;
    if (priv) privDecisions.set(key, allowed);
    else {
      decisions[key] = allowed;
      writeJson('permissions.json', decisions);
    }
    callback(allowed);
  });

  ses.on('will-download', (_event, item, wc) => {
    const priv2 = wc ? isPriv(wc) : priv;
    let savePath = '';
    if (!settings.askDownload) {
      const base = path.basename(item.getFilename()).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'download';
      const ext = path.extname(base);
      const stem = base.slice(0, base.length - ext.length);
      savePath = path.join(app.getPath('downloads'), base);
      for (let n = 1; fs.existsSync(savePath); n++) {
        savePath = path.join(app.getPath('downloads'), `${stem} (${n})${ext}`);
      }
      item.setSavePath(savePath);
    }
    const entry = {
      id: ++dlSeq, name: item.getFilename(), path: savePath, url: item.getURL(),
      total: item.getTotalBytes(), received: 0, state: 'progressing', priv: priv2, at: Date.now()
    };
    downloads.unshift(entry);
    dlItems.set(entry.id, item);
    let last = 0;
    const push = () => broadcast('download-update', entry, priv2);
    item.on('updated', (_e, state) => {
      entry.received = item.getReceivedBytes();
      entry.total = item.getTotalBytes();
      entry.path = item.getSavePath() || entry.path;
      entry.state = state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing';
      if (Date.now() - last > 250) { last = Date.now(); push(); }
    });
    item.once('done', (_e, state) => {
      entry.state = state;
      entry.received = item.getReceivedBytes();
      entry.path = item.getSavePath() || entry.path;
      dlItems.delete(entry.id);
      push();
      writeJson('downloads.json', downloads.filter((d) => !d.priv).slice(0, 100));
    });
    push();
  });
}

// ---------- keyboard shortcuts, also while a web page has focus ----------
function shortcutFor(input) {
  if (input.type !== 'keyDown') return null;
  const key = (input.key || '').toLowerCase();
  const mod = input.control || input.meta;
  if (input.alt && !mod) {
    if (key === 'arrowleft') return 'back';
    if (key === 'arrowright') return 'forward';
    return null;
  }
  if (key === 'f5') return 'reload';
  if (key === 'f12') return 'devtools';
  if (!mod) return null;
  if (key === 'tab') return input.shift ? 'prev-tab' : 'next-tab';
  if (input.shift) {
    switch (key) {
      case 'n': return 'new-private-window';
      case 't': return 'reopen-tab';
      case 'b': return 'toggle-bookmarks-bar';
      case 'o': return 'bookmarks';
      case 'l': return 'lock';
      case 's': return 'reading-list';
      case 'delete': return 'clear-data';
      default: return null;
    }
  }
  if (input.alt) return null;
  if (/^[1-9]$/.test(key)) return 'tab-' + key;
  switch (key) {
    case 't': return 'new-tab';
    case 'w': return 'close-tab';
    case 'l': return 'focus-address';
    case 'r': return 'reload';
    case 'h': return 'history';
    case 'j': return 'downloads';
    case 'f': return 'find';
    case 'p': return 'print';
    case 'd': return 'bookmark';
    case 'n': return 'new-window';
    case ',': return 'settings';
    case '=':
    case '+': return 'zoom-in';
    case '-': return 'zoom-out';
    case '0': return 'zoom-reset';
    default: return null;
  }
}

function wireShortcuts(contents) {
  contents.on('before-input-event', (event, input) => {
    lastActivity = Date.now();
    const action = shortcutFor(input);
    if (!action) return;
    const host = hostOf(contents);
    if (host.isDestroyed()) return;
    event.preventDefault();
    host.send('shortcut', action);
  });
}

function pageContextMenu(contents, p) {
  const host = hostOf(contents);
  const openTab = (url) => host.send('open-tab', url);
  const items = [];
  if (p.linkURL) {
    items.push(
      { label: 'Open link in new tab', click: () => openTab(p.linkURL) },
      { label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) },
      { type: 'separator' }
    );
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push(
      { label: 'Open image in new tab', click: () => openTab(p.srcURL) },
      { label: 'Save image as...', click: () => contents.downloadURL(p.srcURL) },
      { label: 'Copy image address', click: () => clipboard.writeText(p.srcURL) },
      { type: 'separator' }
    );
  }
  if (p.isEditable) {
    items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' });
  } else if (p.selectionText) {
    const text = p.selectionText.trim();
    items.push(
      { role: 'copy' },
      {
        label: `Search ${settings.engine} for "${text.slice(0, 30)}${text.length > 30 ? '...' : ''}"`,
        click: () => openTab(ENGINES[settings.engine] + encodeURIComponent(text))
      },
      { type: 'separator' }
    );
  }
  items.push(
    { label: 'Back', enabled: contents.canGoBack(), click: () => contents.goBack() },
    { label: 'Forward', enabled: contents.canGoForward(), click: () => contents.goForward() },
    { label: 'Reload', click: () => contents.reload() },
    { type: 'separator' },
    { label: 'Inspect', click: () => contents.inspectElement(p.x, p.y) }
  );
  Menu.buildFromTemplate(items).popup({ window: winOf(contents) || undefined });
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;
  contents.setUserAgent(currentUA(), acceptLanguages());
  applyUAOverride(contents);
  contents.setWebRTCIPHandlingPolicy(settings.webrtc ? 'default_public_interface_only' : 'default');
  contents.setWindowOpenHandler(({ url }) => {
    const host = hostOf(contents);
    if (!host.isDestroyed()) host.send('open-tab', url);
    return { action: 'deny' };
  });
  contents.on('did-start-navigation', (details) => {
    lastActivity = Date.now();
    const d = details && details.isMainFrame !== undefined ? details : null;
    if (d && d.isMainFrame && !d.isSameDocument) counts.set(contents.id, 0);
  });
  contents.on('context-menu', (_e, params) => pageContextMenu(contents, params));
  contents.on('destroyed', () => { counts.delete(contents.id); clearTimeout(lastSent.get(contents.id)); lastSent.delete(contents.id); });
  wireShortcuts(contents);
});

// ---------- IPC ----------
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    const ctx = { priv: isPriv(event.sender), win: winOf(event.sender), sender: event.sender };
    try {
      return { ok: true, data: await fn(ctx, ...args) };
    } catch (error) {
      return { ok: false, error: (error && error.message) || String(error) };
    }
  });
}

const needUnlock = () => {
  if (locked) throw new Error('DexBrowse is locked');
};

handle('app:config', (ctx) => ({
  version: app.getVersion(),
  chrome: process.versions.chrome,
  electron: process.versions.electron,
  platform: process.platform,
  priv: ctx.priv,
  settings: publicSettings(),
  lockEnabled: !!settings.lock,
  engines: ENGINES,
  guestPreload: pathToFileURL(path.join(__dirname, 'guest-preload.js')).href,
  downloadsDir: app.getPath('downloads'),
  secureStorage: safeStorage.isEncryptionAvailable(),
  profile: currentProfile(),
  developer: DEVELOPER,
  stats
}));

handle('settings:set', (_ctx, patch) => {
  const { shields: shieldPatch, ...rest } = sanitize(patch || {});
  Object.assign(settings, rest);
  if (shieldPatch) Object.assign(settings.shields, shieldPatch);
  if (rest.theme) nativeTheme.themeSource = settings.theme;
  saveSettings();
  for (const contents of webContents.getAllWebContents()) {
    if (contents.getType() === 'webview') {
      contents.setWebRTCIPHandlingPolicy(settings.webrtc ? 'default_public_interface_only' : 'default');
    }
  }
  broadcast('settings-changed', publicSettings());
  return publicSettings();
});

handle('ua:list', () => ({ names: Object.keys(userAgents), current: settings.ua }));
handle('ua:set', (_ctx, name) => {
  if (!(name in userAgents)) throw new Error('Unknown user agent');
  settings.ua = name;
  saveSettings();
  applyUserAgent();
  return true;
});

// history
handle('history:add', (ctx, { url, title }) => {
  if (ctx.priv || locked || !/^https?:\/\//i.test(url)) return false;
  const visit = { url, title: title || '', visitedAt: Date.now() };
  history = [visit, ...history.filter((h) => h.url !== url)].slice(0, 1000);
  writeJson('history.json', history);
  sync.pushVisit(visit);
  return true;
});
handle('history:list', () => { needUnlock(); return history; });
handle('history:remove', (_ctx, url) => {
  history = history.filter((h) => h.url !== url);
  writeJson('history.json', history);
  return true;
});
handle('history:clear', () => { history = []; writeJson('history.json', history); return true; });

// bookmarks and reading list
const listApi = (name, getList, setList, fileName) => {
  handle(`${name}:list`, () => { needUnlock(); return getList(); });
  handle(`${name}:add`, (ctx, { title, url }) => {
    needUnlock();
    if (ctx.priv) throw new Error('Not available in a private window');
    if (!/^https?:\/\//i.test(url)) throw new Error('Only web pages can be saved');
    if (!getList().some((b) => b.url === url)) {
      setList([{ id: crypto.randomUUID(), title: title || url, url, added: Date.now() }, ...getList()]);
      writeJson(fileName, getList());
    }
    return getList();
  });
  handle(`${name}:remove`, (_ctx, id) => {
    setList(getList().filter((b) => b.id !== id));
    writeJson(fileName, getList());
    return getList();
  });
};
listApi('bookmarks', () => bookmarks, (v) => { bookmarks = v; }, 'bookmarks.json');
listApi('reading', () => reading, (v) => { reading = v; }, 'reading.json');

// downloads
handle('downloads:list', (ctx) => downloads.filter((d) => d.priv === ctx.priv).slice(0, 100));
handle('downloads:cancel', (_ctx, id) => {
  const item = dlItems.get(id);
  if (item) item.cancel();
  return true;
});
handle('downloads:open', async (_ctx, id) => {
  const d = downloads.find((x) => x.id === id);
  if (!d || !d.path || !fs.existsSync(d.path)) throw new Error('File not found');
  const err = await shell.openPath(d.path);
  if (err) throw new Error(err);
  return true;
});
handle('downloads:show', (_ctx, id) => {
  const d = downloads.find((x) => x.id === id);
  if (!d || !d.path || !fs.existsSync(d.path)) throw new Error('File not found');
  shell.showItemInFolder(d.path);
  return true;
});
handle('downloads:clear', (ctx) => {
  downloads = downloads.filter((d) => d.priv !== ctx.priv || d.state === 'progressing');
  writeJson('downloads.json', downloads.filter((d) => !d.priv).slice(0, 100));
  return true;
});

// shields
handle('shields:site', (_ctx, host, wcId) => ({
  host,
  rule: shields.effective(host),
  overrides: siteRules[host] || {},
  count: counts.get(wcId) || 0
}));
handle('shields:site-set', (_ctx, host, patch) => {
  if (!host || typeof host !== 'string') throw new Error('No site');
  const rule = Object.assign({}, siteRules[host]);
  for (const k of ['off', 'ads', 'https', 'cookies', 'scripts']) {
    if (typeof patch[k] === 'boolean') rule[k] = patch[k];
  }
  siteRules[host] = rule;
  writeJson('sites.json', siteRules);
  return shields.effective(host);
});
handle('shields:sites', () => siteRules);
handle('shields:site-reset', (_ctx, host) => {
  delete siteRules[host];
  writeJson('sites.json', siteRules);
  return siteRules;
});
handle('shields:stats', () => stats);

// saved logins (passwords are encrypted with the OS keystore)
const decryptLogin = (l) => safeStorage.decryptString(Buffer.from(l.pw, 'base64'));
handle('logins:list', () => {
  needUnlock();
  return logins.map(({ id, origin, username, updated }) => ({ id, origin, username, updated }));
});
handle('logins:save', (ctx, { origin, username, password }) => {
  needUnlock();
  if (ctx.priv) throw new Error('Not available in a private window');
  if (!settings.savePasswords) throw new Error('Saving passwords is turned off');
  if (!/^https?:\/\//i.test(origin) || !password) throw new Error('Nothing to save');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this system');
  const pw = safeStorage.encryptString(password).toString('base64');
  const existing = logins.find((l) => l.origin === origin && l.username === username);
  if (existing) Object.assign(existing, { pw, updated: Date.now() });
  else logins.unshift({ id: crypto.randomUUID(), origin, username: username || '', pw, updated: Date.now() });
  writeJson('logins.json', logins);
  return true;
});
handle('logins:fill', (ctx, origin) => {
  needUnlock();
  if (ctx.priv || !settings.autofill || !safeStorage.isEncryptionAvailable()) return null;
  const l = logins.find((x) => x.origin === origin);
  if (!l) return null;
  return { username: l.username, password: decryptLogin(l) };
});
handle('logins:reveal', (_ctx, id) => {
  needUnlock();
  const l = logins.find((x) => x.id === id);
  if (!l) throw new Error('Login not found');
  return decryptLogin(l);
});
handle('logins:delete', (_ctx, id) => {
  logins = logins.filter((l) => l.id !== id);
  writeJson('logins.json', logins);
  return true;
});
handle('logins:never', () => settings.neverSave);
handle('logins:never-add', (_ctx, origin) => {
  if (!settings.neverSave.includes(origin)) settings.neverSave.push(origin);
  saveSettings();
  return settings.neverSave;
});
handle('logins:never-remove', (_ctx, origin) => {
  settings.neverSave = settings.neverSave.filter((o) => o !== origin);
  saveSettings();
  return settings.neverSave;
});

// passcode lock
const hashPass = (pass, salt) => crypto.scryptSync(pass, salt, 32).toString('hex');
function checkPass(pass) {
  const l = settings.lock;
  if (!l) return true;
  const a = Buffer.from(hashPass(String(pass || ''), l.salt), 'hex');
  const b = Buffer.from(l.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function lockNow() {
  if (!settings.lock) return false;
  locked = true;
  broadcast('lock', true);
  return true;
}

handle('lock:status', () => ({ enabled: !!settings.lock, locked }));
handle('lock:unlock', (_ctx, pass) => {
  if (Date.now() < blockedUntil) throw new Error('Too many attempts. Try again in a few seconds.');
  if (checkPass(pass)) {
    locked = false;
    failures = 0;
    lastActivity = Date.now();
    broadcast('lock', false);
    return true;
  }
  if (++failures >= 5) { blockedUntil = Date.now() + 30000; failures = 0; }
  throw new Error('Wrong passcode');
});
handle('lock:set', (_ctx, pass, current) => {
  if (settings.lock && !checkPass(current)) throw new Error('Current passcode is wrong');
  if (typeof pass !== 'string' || pass.length < 4) throw new Error('Use at least 4 characters');
  const salt = crypto.randomBytes(16).toString('hex');
  settings.lock = { salt, hash: hashPass(pass, salt) };
  saveSettings();
  return true;
});
handle('lock:remove', (_ctx, current) => {
  if (!checkPass(current)) throw new Error('Wrong passcode');
  settings.lock = null;
  locked = false;
  saveSettings();
  broadcast('lock', false);
  return true;
});
handle('lock:now', () => lockNow());
handle('lock:reset', async (ctx) => {
  const { response } = await dialog.showMessageBox(ctx.win || undefined, {
    type: 'warning',
    buttons: ['Cancel', 'Erase data and remove passcode'],
    defaultId: 0,
    cancelId: 0,
    message: 'Reset the passcode?',
    detail: 'This erases saved passwords, history, bookmarks and the reading list.'
  });
  if (response !== 1) return false;
  logins = []; history = []; bookmarks = []; reading = [];
  for (const f of ['logins', 'history', 'bookmarks', 'reading']) writeJson(`${f}.json`, []);
  settings.lock = null;
  locked = false;
  saveSettings();
  broadcast('lock', false);
  return true;
});
handle('app:activity', () => { lastActivity = Date.now(); return true; });
setInterval(() => {
  const m = settings.autoLockMinutes;
  if (settings.lock && !locked && m > 0 && Date.now() - lastActivity > m * 60000) lockNow();
}, 15000).unref();

// permissions list, clear browsing data, session, misc
handle('permissions:list', () =>
  Object.entries(decisions).map(([key, allowed]) => {
    const [host, permission] = key.split('|');
    return { key, host, permission, allowed };
  }));
handle('permissions:remove', (_ctx, key) => {
  delete decisions[key];
  writeJson('permissions.json', decisions);
  return true;
});
handle('data:clear', async (_ctx, o) => {
  const ses = session.fromPartition(PARTITION);
  if (o.history) { history = []; writeJson('history.json', history); }
  if (o.cookies) await ses.clearStorageData();
  if (o.cache) await ses.clearCache();
  if (o.downloads) { downloads = downloads.filter((d) => d.state === 'progressing'); writeJson('downloads.json', []); }
  if (o.logins) { logins = []; writeJson('logins.json', logins); }
  if (o.sites) { siteRules = {}; writeJson('sites.json', siteRules); decisions = {}; writeJson('permissions.json', decisions); }
  return true;
});
handle('session:save', (ctx, urls) => {
  if (!ctx.priv && Array.isArray(urls)) {
    writeJson('session.json', urls.filter((u) => /^https?:\/\//i.test(u)).slice(0, 40));
  }
  return true;
});
handle('session:load', (ctx) => {
  if (ctx.priv || settings.startup !== 'restore') return [];
  return readJson('session.json', []);
});
// extensions
let extensions = null;
const extList = () => (extensions ? extensions.list() : []);
handle('extensions:list', (ctx) => (ctx.priv ? [] : extList()));
handle('extensions:install-store', (ctx, input) => {
  if (ctx.priv) throw new Error('Extensions are not available in private windows');
  return extensions.installFromStore(input);
});
handle('extensions:install-file', async (ctx) => {
  if (ctx.priv) throw new Error('Extensions are not available in private windows');
  const { canceled, filePaths } = await dialog.showOpenDialog(ctx.win || undefined, {
    title: 'Install extension',
    filters: [{ name: 'Extension package', extensions: ['crx', 'zip'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths[0]) return null;
  return extensions.installFile(filePaths[0]);
});
handle('extensions:install-unpacked', async (ctx) => {
  if (ctx.priv) throw new Error('Extensions are not available in private windows');
  const { canceled, filePaths } = await dialog.showOpenDialog(ctx.win || undefined, {
    title: 'Load unpacked extension (folder with manifest.json)',
    properties: ['openDirectory']
  });
  if (canceled || !filePaths[0]) return null;
  return extensions.installUnpacked(filePaths[0]);
});
handle('extensions:remove', (_ctx, id) => extensions.remove(id));

// profiles
function spawnProfile(id) {
  const keep = process.argv.slice(1).filter((a) => /^--(no-sandbox|password-store|host-resolver-rules|disable-gpu)/.test(a));
  const args = [...(process.defaultApp ? [app.getAppPath()] : []), ...keep, `--profile=${id}`];
  spawn(process.execPath, args, { detached: true, stdio: 'ignore' }).unref();
}
handle('profiles:list', () => ({ current: PROFILE_ID, profiles: readProfiles() }));
handle('profiles:add', (_ctx, { name, color }) => {
  const clean = String(name || '').trim().slice(0, 30);
  if (!clean) throw new Error('Enter a name for the profile');
  const list = readProfiles();
  if (list.some((p) => p.name.toLowerCase() === clean.toLowerCase())) throw new Error('A profile with that name already exists');
  const profile = {
    id: 'p-' + crypto.randomBytes(4).toString('hex'),
    name: clean,
    color: PROFILE_COLORS.includes(color) ? color : PROFILE_COLORS[list.length % PROFILE_COLORS.length]
  };
  list.push(profile);
  writeProfiles(list);
  return profile;
});
handle('profiles:update', (_ctx, id, patch) => {
  const list = readProfiles();
  const profile = list.find((p) => p.id === id);
  if (!profile) throw new Error('Profile not found');
  if (typeof patch.name === 'string' && patch.name.trim()) profile.name = patch.name.trim().slice(0, 30);
  if (PROFILE_COLORS.includes(patch.color)) profile.color = patch.color;
  writeProfiles(list);
  return profile;
});
handle('profiles:delete', (_ctx, id) => {
  if (id === 'default') throw new Error('The default profile cannot be deleted');
  if (id === PROFILE_ID) throw new Error('Switch to another profile before deleting this one');
  if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new Error('Invalid profile');
  fs.rmSync(path.join(ROOT_DIR, 'Profiles', id), { recursive: true, force: true });
  writeProfiles(readProfiles().filter((p) => p.id !== id));
  return true;
});
handle('profiles:open', (_ctx, id) => {
  if (!readProfiles().some((p) => p.id === id)) throw new Error('Profile not found');
  if (id === PROFILE_ID) createWindow(false);
  else spawnProfile(id);
  return true;
});

handle('window:new', (_ctx, priv) => { createWindow(!!priv); return true; });
handle('app:quit', () => { app.quit(); return true; });
handle('page:savepdf', async (ctx, base64, name) => {
  const { canceled, filePath } = await dialog.showSaveDialog(ctx.win || undefined, {
    defaultPath: path.join(app.getPath('documents'), `${String(name || 'page').replace(/[<>:"/\\|?*]/g, '_')}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return true;
});

// Google sync
handle('sync:status', () => sync.status());
handle('sync:signin', async () => {
  needUnlock();
  const email = await sync.signIn();
  sync.pushMany(history).catch(() => {});
  return email;
});
handle('sync:signout', () => { sync.signOut(); return true; });
handle('sync:cloud', () => { needUnlock(); return sync.fetchHistory(); });
handle('sync:upload', async () => { needUnlock(); await sync.pushMany(history); return true; });

// ---------- windows ----------
function createWindow(priv = false) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: priv ? '#1A0F2E' : '#0B1220',
    icon: APP_ICON,
    title: (priv ? 'DexBrowse (Private)' : 'DexBrowse By Fuad') + (PROFILE_ID !== 'default' ? ' \u2013 ' + currentProfile().name : ''),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  });
  const id = win.webContents.id;
  wins.set(id, { win, priv });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wireShortcuts(win.webContents);
  win.loadFile(path.join(__dirname, 'ui', 'index.html'), { query: priv ? { private: '1' } : {} });
  win.on('closed', () => {
    wins.delete(id);
    if (priv && ![...wins.values()].some((w) => w.priv)) {
      const ses = session.fromPartition(PRIVATE_PARTITION);
      ses.clearStorageData().catch(() => {});
      ses.clearCache().catch(() => {});
      privDecisions.clear();
      downloads = downloads.filter((d) => !d.priv);
    }
  });
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Launching DexBrowse again opens another browser window instead of doing nothing.
  app.on('second-instance', () => {
    const win = createWindow(false);
    win.once('ready-to-show', () => win.focus());
  });

  app.whenReady().then(() => {
    const merge = (base, patch) => {
      for (const k of Object.keys(patch || {})) {
        if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && base[k]) merge(base[k], patch[k]);
        else base[k] = patch[k];
      }
      return base;
    };
    settings = merge(JSON.parse(JSON.stringify(DEFAULTS)), readJson('settings.json', {}));
    if (!(settings.ua in userAgents)) settings.ua = DEFAULTS.ua;
    if (!(settings.engine in ENGINES)) settings.engine = DEFAULTS.engine;
    history = readJson('history.json', []);
    bookmarks = readJson('bookmarks.json', []);
    reading = readJson('reading.json', []);
    logins = readJson('logins.json', []);
    siteRules = readJson('sites.json', {});
    decisions = readJson('permissions.json', {});
    stats = Object.assign(stats, readJson('stats.json', {}));
    downloads = readJson('downloads.json', []).map((d) =>
      d.state === 'progressing' || d.state === 'paused' ? Object.assign(d, { state: 'interrupted' }) : d);
    dlSeq = downloads.reduce((m, d) => Math.max(m, d.id || 0), 0);
    locked = !!settings.lock;
    nativeTheme.themeSource = settings.theme;

    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'editMenu' }]));
    app.setAboutPanelOptions({
      applicationName: 'DexBrowse',
      applicationVersion: app.getVersion(),
      copyright: `Developed by ${DEVELOPER} (DexBrowse By Fuad)`
    });
    setupSession(session.fromPartition(PARTITION), false);
    setupSession(session.fromPartition(PRIVATE_PARTITION), true);
    applyUserAgent();
    extensions = createExtensions({
      getSession: () => session.fromPartition(PARTITION),
      dir: path.join(app.getPath('userData'), 'Extensions'),
      chromeVersion: process.versions.chrome
    });
    extensions.loadAll().catch(() => {});
    createWindow(false);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(false);
    });
  });

  app.on('before-quit', () => writeJson('stats.json', stats));
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
