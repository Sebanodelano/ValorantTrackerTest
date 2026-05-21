const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("valorantStatsApp", {
  platform: process.platform,
  windowControls: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close")
  }
});
