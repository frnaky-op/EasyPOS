require("@electron/remote/main").initialize();
require("electron-store").initRenderer();
const setupEvents = require("./installers/setupEvents");
if (setupEvents.handleSquirrelEvent()) {
    return;
}
const server = require('./server');
const { app, BrowserWindow, ipcMain, screen} = require("electron");
const path = require("path");
const contextMenu = require("electron-context-menu");
let { Menu, template } = require("./assets/js/native_menu/menu");
const { setLanguage, t } = require("./assets/js/i18n");
const menuController = require('./assets/js/native_menu/menuController.js');
const { registerUpdates } = require("./updates");
const isPackaged = app.isPackaged;
function translatedMenu(items) {
    return items.map(item => ({
        ...item,
        ...(item.label ? { label: t(item.label) } : {}),
        ...(item.submenu ? { submenu: translatedMenu(item.submenu) } : {}),
    }));
}

function refreshMenu(language) {
    setLanguage(language);
    Menu.setApplicationMenu(Menu.buildFromTemplate(translatedMenu(template)));
}
refreshMenu("fr");
let mainWindow;
let updates;

//stop app from launching multiple times during these squirrel spawning events
if (require('electron-squirrel-startup')) app.quit();

function createWindow() {

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    mainWindow = new BrowserWindow({
        width: width,
        height: height,
        frame: true,
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: false,
            contextIsolation: false,
        },
    });
    menuController.initializeMainWindow(mainWindow); 
    mainWindow.maximize();
    mainWindow.show();

    mainWindow.loadURL(`file://${path.join(__dirname, "index.html")}`);
    mainWindow.webContents.once("did-finish-load", () => updates.check());

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
    
}

app.on("browser-window-created", (_, window) => {
    require("@electron/remote/main").enable(window.webContents);
});

app.whenReady().then(() => {
    updates = registerUpdates(app, ipcMain, () => mainWindow);
    createWindow();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (mainWindow === null) {
        createWindow();
    }
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});

ipcMain.on("app-quit", (evt, arg) => {
    app.quit();
});

ipcMain.on("app-reload", (event, arg) => {
    mainWindow.reload();
});

ipcMain.on("language-changed", (_event, language) => refreshMenu(language));

ipcMain.on("settings-backup", () => {
    menuController.saveBackupDialog(menuController.dbFolderPath, menuController.uploadsFolderPath);
});

ipcMain.on("settings-restore", () => {
    menuController.restoreBackupDialog(menuController.dbFolderPath, menuController.uploadsFolderPath);
});

//Context menu
contextMenu({
    prepend: (params, browserWindow) => [
        {
            label: t("Refresh"),
            click() {
                mainWindow.reload();
            },
        },
    ],
});

//Live reload during development
if (!isPackaged) {
    try {
        require("electron-reloader")(module);
    } catch (_) {}
}


