const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('peentDesktop', {
  saveFile: (name, bytes) => ipcRenderer.invoke('save-file', {name, bytes: Array.from(bytes)}),
  readMaterialLibrary: () => ipcRenderer.invoke('material-library-read'),
  writeMaterialLibrary: (raw) => ipcRenderer.invoke('material-library-write',raw)
});
