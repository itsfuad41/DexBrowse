const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const EVENTS = ['open-tab', 'shortcut', 'download'];

contextBridge.exposeInMainWorld('dex', {
  info: call('app:info'),
  uaList: call('ua:list'),
  uaSet: call('ua:set'),
  historyAdd: call('history:add'),
  historyList: call('history:list'),
  historyClear: call('history:clear'),
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
