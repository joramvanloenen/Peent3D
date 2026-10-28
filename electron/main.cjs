const {app, BrowserWindow, ipcMain, dialog, session} = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
if(process.env.PEENT_TEST==='1'){
  app.commandLine.appendSwitch('use-gl','angle');
  app.commandLine.appendSwitch('use-angle','swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
}
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
  if(process.env.PEENT_TEST==='1')mainWindow.loadFile(path.join(__dirname,'..','dist','index.html'),{query:{smoke:'1'}});
  else if(!app.isPackaged)mainWindow.loadURL('http://127.0.0.1:5173');
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

const materialLibraryPath=()=>path.join(app.getPath('userData'),'material-library-v1.json');
ipcMain.handle('material-library-read',async event=>{
  if(event.sender!==mainWindow?.webContents)return {error:'Unauthorized'};
  try{
    const raw=await fs.readFile(materialLibraryPath(),'utf8');
    if(raw.length>48*1024*1024)return {error:'Material library exceeds 48 MB'};
    return {raw};
  }catch(error){
    if(error.code==='ENOENT')return {raw:null};
    return {error:error.message};
  }
});
ipcMain.handle('material-library-write',async(event,raw)=>{
  if(event.sender!==mainWindow?.webContents)return {error:'Unauthorized'};
  if(typeof raw!=='string'||raw.length>48*1024*1024)return {error:'Invalid material library size'};
  try{
    const data=JSON.parse(raw);
    if(data?.format!=='peent3d-material-library'||data?.version!==1||
       !Array.isArray(data.materials)||data.materials.length>80)return {error:'Invalid material library'};
    const file=materialLibraryPath();
    await fs.mkdir(path.dirname(file),{recursive:true});
    const temporary=file+'.tmp';
    await fs.writeFile(temporary,raw,'utf8');
    await fs.rename(temporary,file);
    return {saved:true};
  }catch(error){return {error:error.message};}
});
