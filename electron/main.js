const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    title: "Valorant Stats App",
    backgroundColor: "#101214",
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDevelopment) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
}

ipcMain.handle("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle("window:maximize", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window) {
    return false;
  }

  if (window.isMaximized()) {
    window.unmaximize();
    return false;
  }

  window.maximize();
  return true;
});

ipcMain.handle("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
