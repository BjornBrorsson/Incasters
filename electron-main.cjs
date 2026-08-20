const { app, BrowserWindow, session, shell } = require('electron');
const path = require('node:path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#04060f',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: false,
      spellcheck: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) {
      event.preventDefault();
      if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url);
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const webRoot = app.isPackaged ? path.join(process.resourcesPath, 'dist') : path.join(__dirname, 'dist');
  void mainWindow.loadFile(path.join(webRoot, 'index.html'));
}

app.setAppUserModelId('com.incasters.game');
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
