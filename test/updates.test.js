const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { registerUpdates } = require("../updates");

test("installed app checks once, reports download and installs only when ready", async () => {
  const updater = new EventEmitter();
  const ipc = new EventEmitter();
  const sent = [];
  let checks = 0;
  let installs = 0;
  updater.checkForUpdates = async () => { checks++; };
  updater.quitAndInstall = () => { installs++; };
  const app = { isPackaged: true, getVersion: () => "1.6.0" };
  const manager = registerUpdates(app, ipc, () => ({
    isDestroyed: () => false,
    webContents: { send: (...args) => sent.push(args) },
  }), updater);
  ipc.emit("update:install");
  assert.equal(installs, 0);
  manager.check();
  manager.check();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(checks, 1);
  updater.emit("update-available", { version: "1.6.1" });
  updater.emit("download-progress", { percent: 72.9 });
  assert.equal(sent.at(-1)[1].percent, 72);
  updater.emit("update-downloaded", { version: "1.6.1" });
  ipc.emit("update:install");
  assert.equal(installs, 1);
  assert.equal(sent.at(-1)[1].phase, "ready");
});

test("source runs never request updates or install them", () => {
  const updater = new EventEmitter();
  const ipc = new EventEmitter();
  let checks = 0;
  updater.checkForUpdates = async () => { checks++; };
  updater.quitAndInstall = () => assert.fail("must not install in development");
  const manager = registerUpdates({ isPackaged: false, getVersion: () => "1.6.0" }, ipc,
    () => null, updater);
  manager.check();
  ipc.emit("update:install");
  assert.equal(checks, 0);
});
