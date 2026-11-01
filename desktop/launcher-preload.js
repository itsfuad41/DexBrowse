const { contextBridge, ipcRenderer } = require('electron');
const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld('launcher', {
  state: call('launcher:state'),
  unlock: call('launcher:unlock'),
  create: call('launcher:create'),
  recover: call('launcher:recover')
});
