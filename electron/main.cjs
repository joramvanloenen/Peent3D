const {app, BrowserWindow, ipcMain, dialog, session} = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width:1550,height:960,minWidth:1100,minHeight:700,
    backgroundColor:'#11151c',title:'Peent3D',show:false,
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true
    }
  });
  mainWindow.once('ready-to-show',()=>mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  mainWindow.webContents.on('will-navigate',e=>e.preventDefault());
  if(!app.isPackaged)mainWindow.loadURL('http://127.0.0.1:5173');
  else mainWindow.loadFile(path.join(__dirname,'..','dist','index.html'));
}
app.whenReady().then(()=>{
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
ipcMain.handle('save-file',async(event,payload)=>{
  if(event.sender!==mainWindow?.webContents)return{error:'Unauthorized'};
  const name=path.basename(String(payload?.name||'Peent3D-output.png'));
  const ext=name.toLowerCase().split('.').pop();
  const filters=ext==='peent'||ext==='json'
    ?[{name:'Peent3D project',extensions:['peent','json']}]
    :ext==='zip'?[{name:'ZIP archive',extensions:['zip']}]:[{name:'PNG images',extensions:['png']}];
  const{canceled,filePath}=await dialog.showSaveDialog(mainWindow,{defaultPath:name,filters});
  if(canceled||!filePath)return{canceled:true};
  const bytes=payload?.bytes;
  if(!Array.isArray(bytes)&&!(bytes instanceof Uint8Array))return{error:'Invalid file content'};
  if(bytes.length>1024*1024*1024)return{error:'File exceeds the 1 GiB safety limit'};
  await fs.writeFile(filePath,Buffer.from(bytes));
  return{path:filePath};
});
