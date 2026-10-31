const { app, BrowserWindow, ipcMain, session, shell, dialog, Menu, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const sync = require('./sync');
const makeUserAgents = require('./uas');

// Present as plain Chromium: drop the "Electron/x" and app-name tokens.
const cleanUA = app.userAgentFallback.replace(/\s(?:Electron|dexbrowse-desktop|DexBrowse)\/\S+/gi, '');
app.userAgentFallback = cleanUA;

const chromeMajor = process.versions.chrome.split('.')[0];
const userAgents = makeUserAgents(chromeMajor);

let win = null;
const PARTITION = 'persist:browse';

// ---------- small JSON stores ----------
const file = (name) => path.join(app.getPath('userData'), name);
function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch (_) {
    return fallback;
  }
}
function writeJson(name, value) {
  fs.writeFileSync(file(name), JSON.stringify(value));
}

let settings = { ua: 'This browser (default)' };
let history = [];

const currentUA = () => userAgents[settings.ua] || cleanUA;

// session.setUserAgent only affects new pages, so also update every open tab.
function applyUserAgent() {
  session.fromPartition(PARTITION).setUserAgent(currentUA());
  for (const contents of webContents.getAllWebContents()) {
    if (contents.getType() === 'webview') contents.setUserAgent(currentUA());
  }
}

// ---------- permissions (camera, microphone, notifications ...) ----------
const asked = new Map();
const AUTO_ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'window-management']);
const ASK = {
  media: 'your camera and/or microphone',
  notifications: 'show notifications',
  midi: 'use MIDI devices',
  'clipboard-read': 'read your clipboard',
  'display-capture': 'share your screen'
};

function setupSession() {
  const ses = session.fromPartition(PARTITION);

  ses.setPermissionRequestHandler(async (_wc, permission, callback, details) => {
    if (AUTO_ALLOW.has(permission)) return callback(true);
    if (!ASK[permission]) return callback(false);
    let host = 'This site';
    try {
      host = new URL(details.requestingUrl).host;
    } catch (_) {
      /* keep default */
    }
    const key = `${host}|${permission}`;
    if (asked.has(key)) return callback(asked.get(key));
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Allow', 'Block'],
      defaultId: 1,
      cancelId: 1,
      title: 'Permission request',
      message: `${host} wants to ${ASK[permission].startsWith('your') ? 'use ' : ''}${ASK[permission]}.`
    });
    const allowed = response === 0;
    asked.set(key, allowed);
    callback(allowed);
  });

  ses.on('will-download', (_event, item) => {
    item.once('done', (_e, state) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('download', { name: item.getFilename(), state });
      }
    });
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
  if (input.shift || input.alt) return null;
  switch (key) {
    case 't': return 'new-tab';
    case 'w': return 'close-tab';
    case 'l': return 'focus-address';
    case 'r': return 'reload';
    case 'h': return 'history';
    case '=':
    case '+': return 'zoom-in';
    case '-': return 'zoom-out';
    case '0': return 'zoom-reset';
    default: return null;
  }
}

function wireShortcuts(contents) {
  contents.on('before-input-event', (event, input) => {
    const action = shortcutFor(input);
    if (!action || !win || win.isDestroyed()) return;
    event.preventDefault();
    win.webContents.send('shortcut', action);
  });
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setUserAgent(currentUA());
    // window.open / target=_blank become new tabs.
    contents.setWindowOpenHandler(({ url }) => {
      if (win && !win.isDestroyed()) win.webContents.send('open-tab', url);
      return { action: 'deny' };
    });
    wireShortcuts(contents);
  }
});

// ---------- IPC ----------
function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (error) {
      return { ok: false, error: (error && error.message) || String(error) };
    }
  });
}

handle('app:info', () => ({
  version: app.getVersion(),
  chrome: process.versions.chrome,
  electron: process.versions.electron
}));

handle('ua:list', () => ({ names: Object.keys(userAgents), current: settings.ua }));
handle('ua:set', (name) => {
  if (!(name in userAgents)) throw new Error('Unknown user agent');
  settings.ua = name;
  writeJson('settings.json', settings);
  applyUserAgent();
  return true;
});

handle('history:add', ({ url, title }) => {
  if (!/^https?:\/\//i.test(url)) return false;
  const visit = { url, title: title || '', visitedAt: Date.now() };
  history = [visit, ...history.filter((h) => h.url !== url)].slice(0, 1000);
  writeJson('history.json', history);
  sync.pushVisit(visit);
  return true;
});
handle('history:list', () => history);
handle('history:clear', () => {
  history = [];
  writeJson('history.json', history);
  return true;
});

handle('sync:status', () => sync.status());
handle('sync:signin', async () => {
  const email = await sync.signIn();
  sync.pushMany(history).catch(() => {});
  return email;
});
handle('sync:signout', () => {
  sync.signOut();
  return true;
});
handle('sync:cloud', () => sync.fetchHistory());
handle('sync:upload', async () => {
  await sync.pushMany(history);
  return true;
});

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#0B1220',
    title: 'DexBrowse By Fuad',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wireShortcuts(win.webContents);
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.on('closed', () => {
    win = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    settings = Object.assign(settings, readJson('settings.json', {}));
    if (!(settings.ua in userAgents)) settings.ua = 'This browser (default)';
    history = readJson('history.json', []);
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'editMenu' }]));
    setupSession();
    applyUserAgent();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
