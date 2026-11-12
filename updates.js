function registerUpdates(app, ipcMain, getWindow, injectedUpdater) {
  const updater = injectedUpdater || require("electron-updater").autoUpdater;
  let state = { phase: app.isPackaged ? "idle" : "development", version: app.getVersion() };
  let checking = false;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;

  function publish(phase, extra = {}) {
    state = { phase, version: app.getVersion(), ...extra };
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send("update:status", state);
  }

  updater.on("checking-for-update", () => publish("checking"));
  updater.on("update-available", info => publish("downloading", { availableVersion: info.version }));
  updater.on("download-progress", progress => publish("downloading", {
    availableVersion: state.availableVersion, percent: Math.floor(progress.percent),
  }));
  updater.on("update-not-available", () => { checking = false; publish("current"); });
  updater.on("update-downloaded", info => {
    checking = false;
    publish("ready", { availableVersion: info.version });
  });
  updater.on("error", error => {
    checking = false;
    publish("error", { message: error.message });
  });

  ipcMain.on("update:get-status", event => event.sender.send("update:status", state));
  ipcMain.on("update:check", () => check());
  ipcMain.on("update:install", () => {
    if (app.isPackaged && state.phase === "ready") updater.quitAndInstall(false, true);
  });

  function check() {
    if (!app.isPackaged || checking || state.phase === "ready") return;
    checking = true;
    publish("checking");
    updater.checkForUpdates().catch(error => {
      checking = false;
      publish("error", { message: error.message });
    });
  }

  return { check };
}

module.exports = { registerUpdates };
