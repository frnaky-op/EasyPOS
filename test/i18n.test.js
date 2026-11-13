const test = require("node:test");
const assert = require("node:assert/strict");
const { setLanguage, t, tf } = require("../assets/js/i18n");
const { sections } = require("../assets/js/navigation");

test("app language covers navigation, transactions, and dynamic stock labels", () => {
  setLanguage("en");
  assert.equal(t("Ventes & rapports"), "Sales & reports");
  assert.equal(t("Ventes"), "Sales");
  assert.equal(t("Achats"), "Purchases");
  assert.equal(tf("Stock actuel : {quantity}", { quantity: 100 }), "Current stock: 100");
  assert.equal(t("Walk in customer"), "Walk-in customer");

  setLanguage("ar");
  assert.equal(t("Ventes & rapports"), "المبيعات والتقارير");
  assert.equal(tf("Stock actuel : {quantity}", { quantity: 100 }), "المخزون الحالي: 100");
  assert.equal(t("File"), "ملف");
  for (const section of sections) {
    assert.notEqual(t(section.title), section.title, `Arabic section: ${section.title}`);
    for (const item of section.items) assert.notEqual(t(item.label), item.label, `Arabic menu item: ${item.label}`);
  }

  setLanguage("fr");
  assert.equal(t("Walk in customer"), "Client comptoir");
  assert.equal(t("Product barcode sheet"), "Liste des codes-barres produits");
  assert.equal(setLanguage("unknown"), "fr");
});
