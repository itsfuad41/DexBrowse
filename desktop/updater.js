// Self-update from GitHub releases (electron-updater reads latest.yml published with each release).
// Downloads in the background and installs when you press "Restart to update" or when DexBrowse quits.
const { app } = require('electron');
const fs = require('fs');

function createUpdater({ isAuto, notify, logFile, beforeInstall }) {
  let au = null;
  const log = (level, args) => {
    try {
      if (logFile) fs.appendFileSync(logFile, `${new Date().toISOString()} ${level} ${args.map((a) => (a && a.stack) || (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`);
    } catch (_) { /* ignore */ }
  };
  const logger = { info: (...a) => log('INFO', a), warn: (...a) => log('WARN', a), error: (...a) => log('ERROR', a), debug: (...a) => log('DEBUG', a) };
  let state = { state: 'idle', version: app.getVersion() };
  const set = (next) => { state = { ...state, ...next }; notify(state); };

  function init() {
    if (au || !app.isPackaged) return au;
    try {
      au = require('electron-updater').autoUpdater;
    } catch (_) {
      return null;
    }
    au.autoDownload = true;
    au.autoInstallOnAppQuit = true;
    au.allowPrerelease = false;
    au.logger = logger;
    au.allowDowngrade = false;
    au.on('checking-for-update', () => set({ state: 'checking' }));
    au.on('update-available', (i) => set({ state: 'downloading', version: i.version, percent: 0 }));
    au.on('update-not-available', () => set({ state: 'none', version: app.getVersion() }));
    au.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent || 0) }));
    au.on('update-downloaded', (i) => set({ state: 'ready', version: i.version }));
    au.on('error', (e) => set({ state: 'error', message: (e && e.message ? e.message : String(e)).split('\n')[0].slice(0, 200) }));
    return au;
  }

  async function check() {
    if (!app.isPackaged) { set({ state: 'dev', message: 'Updates work in the installed app.' }); return state; }
    const u = init();
    if (!u) { set({ state: 'error', message: 'Updater is not available' }); return state; }
    if (state.state === 'downloading' || state.state === 'ready') return state;
    try { await u.checkForUpdates(); } catch (_) { /* reported through the error event */ }
    return state;
  }

  // Other DexBrowse processes (other profiles, guest) would block the installer, so they are closed first.
  async function install() {
    if (!(au && state.state === 'ready')) return false;
    logger.info('installing update', state.version);
    try { await beforeInstall(); } catch (e) { logger.warn('beforeInstall failed', e); }
    au.quitAndInstall(true, true);
    return true;
  }

  function start() {
    if (!app.isPackaged) return;
    const tick = () => { if (isAuto()) check(); };
    setTimeout(tick, 8000).unref();
    setInterval(tick, 4 * 3600 * 1000).unref();
  }

  return { check, install, start, status: () => state, logFile };
}

module.exports = { createUpdater };
