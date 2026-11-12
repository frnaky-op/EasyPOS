const test = require("node:test");
const assert = require("node:assert/strict");
const { saleTerminal } = require("../assets/js/sale-terminal");

test("standalone sales use till one when old installs have no local terminal record", () => {
  assert.deepEqual(saleTerminal(undefined, { app: "Standalone Point of Sale" }), { till: 1, mac: "" });
  assert.deepEqual(saleTerminal(undefined, { app: "Network Point of Sale Server" }), { till: 1, mac: "" });
});

test("configured network terminals keep their own till and MAC", () => {
  assert.deepEqual(saleTerminal({ app: "Network Point of Sale Terminal", till: "3", mac: "AA:BB" }), {
    till: 3, mac: "AA:BB",
  });
  assert.throws(() => saleTerminal(undefined, { app: "Network Point of Sale Terminal" }), /numéro de caisse/);
});
