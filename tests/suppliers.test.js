const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");

test("supplier directory includes existing product names and protects referenced suppliers", async () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), "easypos-suppliers-"));
  process.env.APPDATA = appData;
  process.env.APPNAME = "test-suppliers";
  fs.mkdirSync(path.join(appData, "test-suppliers", "server", "databases"), { recursive: true });
  fs.mkdirSync(path.join(appData, "test-suppliers", "uploads"), { recursive: true });
  const inventory = require("../api/inventory");
  const app = express();
  app.use("/api/inventory", inventory);
  app.use("/api/suppliers", require("../api/suppliers")(inventory.inventoryDB, inventory.receiptsDB));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const json = (method, url, body) => fetch(base + url, {
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  try {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      id: "", barcode: "SUP-001", expirationDate: "", price: "12", category: "Test",
      supplier: "Araplast", quantity: "100", name: "Tube PPR", minStock: "5", img: "", remove: "0",
    })) form.append(key, value);
    assert.equal((await fetch(base + "/inventory/product", { method: "POST", body: form })).status, 200);
    let suppliers = await fetch(base + "/suppliers/all").then(response => response.json());
    assert.equal(suppliers.find(item => item.name === "Araplast").productCount, 1);

    const created = await json("POST", "/suppliers/supplier", { name: "Araplast", phone: "0522000000" });
    assert.equal(created.status, 201);
    const record = await created.json();
    assert.equal((await json("POST", "/suppliers/supplier", { name: "araplast" })).status, 409);
    assert.equal((await json("PUT", "/suppliers/supplier/" + record._id,
      { name: "Araplast", phone: "0522111111" })).status, 200);
    assert.equal((await json("PUT", "/suppliers/supplier/" + record._id,
      { name: "Renamed supplier" })).status, 409);
    assert.equal((await fetch(base + "/suppliers/supplier/" + record._id, { method: "DELETE" })).status, 409);
    suppliers = await fetch(base + "/suppliers/all").then(response => response.json());
    assert.equal(suppliers.find(item => item.name === "Araplast").phone, "0522111111");

    const unused = await json("POST", "/suppliers/supplier", { name: "Unused supplier" }).then(response => response.json());
    assert.equal((await fetch(base + "/suppliers/supplier/" + unused._id, { method: "DELETE" })).status, 204);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(appData, { recursive: true, force: true });
  }
});
