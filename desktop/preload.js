const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const EVENTS = ['open-tab', 'shortcut', 'download-update', 'blocked', 'settings-changed', 'lock', 'hosted-navigate'];

contextBridge.exposeInMainWorld('dex', {
  config: call('app:config'),
  settingsSet: call('settings:set'),
  uaList: call('ua:list'),
  uaSet: call('ua:set'),

  historyAdd: call('history:add'),
  historyList: call('history:list'),
  historyClear: call('history:clear'),
  historyRemove: call('history:remove'),

  bookmarksList: call('bookmarks:list'),
  bookmarksAdd: call('bookmarks:add'),
  bookmarksRemove: call('bookmarks:remove'),
  readingList: call('reading:list'),
  readingAdd: call('reading:add'),
  readingRemove: call('reading:remove'),

  downloadsList: call('downloads:list'),
  downloadsCancel: call('downloads:cancel'),
  downloadsOpen: call('downloads:open'),
  downloadsShow: call('downloads:show'),
  downloadsClear: call('downloads:clear'),

  shieldsSite: call('shields:site'),
  shieldsSiteSet: call('shields:site-set'),
  shieldsSites: call('shields:sites'),
  shieldsSiteReset: call('shields:site-reset'),
  shieldsStats: call('shields:stats'),

  bookmarksUpdate: call('bookmarks:update'),
  bookmarksReorder: call('bookmarks:reorder'),
  bmFolders: call('bookmarks:folders'),
  bmFolderAdd: call('bookmarks:folder-add'),
  bmFolderRename: call('bookmarks:folder-rename'),
  bmFolderRemove: call('bookmarks:folder-remove'),
  bmAddMany: call('bookmarks:add-many'),
  bmExport: call('bookmarks:export'),
  suggest: call('suggest:query'),
  openExternal: call('external:open'),
  loginsList: call('logins:list'),
  loginsSave: call('logins:save'),
  loginsAccounts: call('logins:accounts'),
  loginsFill: call('logins:fill'),
  loginsReveal: call('logins:reveal'),
  loginsDelete: call('logins:delete'),
  loginsAdd: call('logins:add'),
  loginsUpdate: call('logins:update'),
  loginsAudit: call('logins:audit'),
  loginsGenerate: call('logins:generate'),
  loginsNever: call('logins:never'),
  loginsNeverAdd: call('logins:never-add'),
  loginsNeverRemove: call('logins:never-remove'),

  lockStatus: call('lock:status'),
  lockUnlock: call('lock:unlock'),
  lockSet: call('lock:set'),
  lockRemove: call('lock:remove'),
  lockNow: call('lock:now'),
  lockReset: call('lock:reset'),

  permissionsList: call('permissions:list'),
  permissionsRemove: call('permissions:remove'),
  dataClear: call('data:clear'),

  sessionSave: call('session:save'),
  sessionLoad: call('session:load'),
  windowNew: call('window:new'),
  windowQuit: call('app:quit'),
  windowClose: call('window:close'),
  savePdf: call('page:savepdf'),
  activity: call('app:activity'),

  extensionsList: call('extensions:list'),
  extensionsInstallStore: call('extensions:install-store'),
  extensionsInstallFile: call('extensions:install-file'),
  extensionsInstallUnpacked: call('extensions:install-unpacked'),
  extensionsRemove: call('extensions:remove'),

  updateStatus: call('update:status'),
  updateCheck: call('update:check'),
  updateInstall: call('update:install'),
  updateLog: call('update:log'),

  importDetect: call('import:detect'),
  importRun: call('import:run'),
  importFile: call('import:file'),

  profilesCurrent: call('profiles:current'),
  profilesUpdate: call('profiles:update'),
  profilesChangePasscode: call('profiles:change-passcode'),
  profilesAdd: call('profiles:add'),
  profilesSwitch: call('profiles:switch'),
  profilesDelete: call('profiles:delete'),

  syncStatus: call('sync:status'),
  syncSignIn: call('sync:signin'),
  syncSignOut: call('sync:signout'),
  syncCloud: call('sync:cloud'),
  syncUpload: call('sync:upload'),

  on(channel, callback) {
    if (EVENTS.includes(channel)) {
      ipcRenderer.on(channel, (_event, data) => callback(data));
    }
  }
});
