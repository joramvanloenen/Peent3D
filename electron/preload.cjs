const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('peentDesktop', {
  saveFile: (name, bytes) => ipcRenderer.invoke('save-file', {name, bytes: Array.from(bytes)})
});
