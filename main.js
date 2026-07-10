// Figulate — Electron main process. Opens the SPA in a native desktop window.
const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: "Figulate",
    icon: path.join(__dirname, "icon-512.png"),
    backgroundColor: "#eceff3",
    webPreferences: { contextIsolation: true },
  });
  win.loadFile(path.join(__dirname, "Figulate.html"));
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: "File", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "quit" }] },
      { label: "View", submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" }] },
    ])
  );
}

app.whenReady().then(() => {
  // BrowserWindow's `icon` option only sets the Windows/Linux taskbar icon;
  // macOS needs the Dock icon set separately when running unpackaged (`electron .`).
  if (process.platform === "darwin" && app.dock) app.dock.setIcon(path.join(__dirname, "icon-512.png"));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
