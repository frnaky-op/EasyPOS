const test = require("node:test");
const assert = require("node:assert/strict");
const { barcodeValue, createBarcodeSheet, PER_PAGE } = require("../assets/js/barcode-sheet");

test("barcode sheet keeps only selected products and adds a page when needed", () => {
  const calls = { pages: 0, images: 0, codes: [], outputFormat: "" };
  const data = Uint8Array.from([37, 80, 68, 70]).buffer;
  class FakePDF {
    addPage() { calls.pages += 1; }
    setFont() {}
    setFontSize() {}
    setDrawColor() {}
    roundedRect() {}
    splitTextToSize(value) { return [value]; }
    text(value) { if (/^CODE-/.test(value)) calls.codes.push(value); }
    addImage() { calls.images += 1; }
    output(format) { calls.outputFormat = format; return data; }
  }
  const selected = Array.from({ length: PER_PAGE + 1 }, (_, index) => ({
    _id: index + 1, name: `Product ${index + 1}`, barcode: `CODE-${index + 1}`,
  }));
  const result = createBarcodeSheet(selected, {
    jsPDFClass: FakePDF,
    JsBarcode(canvas) { canvas.width = 200; canvas.height = 54; },
    document: { createElement() { return { toDataURL() { return "data:image/png;base64,AA=="; } }; } },
  });
  assert.deepEqual(result, { pageCount: 2, productCount: PER_PAGE + 1, data });
  assert.equal(calls.pages, 1);
  assert.equal(calls.images, PER_PAGE + 1);
  assert.equal(calls.codes.length, PER_PAGE + 1);
  assert.equal(calls.outputFormat, "arraybuffer");
});

test("missing or unsupported stored barcode falls back to numeric product ID", () => {
  assert.equal(barcodeValue({ _id: 123, barcode: "" }), "123");
  assert.equal(barcodeValue({ _id: 123, barcode: "رقم" }), "123");
  assert.equal(barcodeValue({ _id: 123, barcode: "123456789" }), "123456789");
  assert.throws(() => barcodeValue({ _id: "", barcode: "" }), /no printable barcode/);
});
