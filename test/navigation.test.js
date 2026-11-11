const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { sections, allowed } = require("../assets/js/navigation");

test("the shared menu has one unique destination for each page", () => {
  const items = sections.flatMap(section => section.items);
  assert.equal(items.length, 10);
  assert.equal(new Set(items.map(item => item.key)).size, items.length);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  assert.deepEqual(items.filter(item => item.modal).map(item => item.key), []);
});

test("the shared menu applies account permissions to every protected destination", () => {
  const user = { perm_products: 0, perm_categories: 0, perm_transactions: 0, perm_users: 0, perm_settings: 0 };
  const visible = sections.flatMap(section => section.items).filter(item => allowed(item, user)).map(item => item.key);
  assert.deepEqual(visible, ["pos", "orders", "clients"]);
});

test("every navigation icon exists in the bundled Font Awesome stylesheet", () => {
  const css = fs.readFileSync(path.join(__dirname, "../assets/dist/css/bundle.min.css"), "utf8");
  for (const item of sections.flatMap(section => section.items)) {
    assert.ok(css.includes(`.fa-${item.icon}:before`), `${item.label} uses a missing icon`);
  }
});
