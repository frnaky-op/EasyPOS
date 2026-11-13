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

test("Arabic barcode headings and names render through canvas images", () => {
  const labels = [];
  class FakePDF {
    setFont() {}
    setFontSize() {}
    text() {}
    splitTextToSize(value) { return [value]; }
    setDrawColor() {}
    roundedRect() {}
    addImage(data) { labels.push(data); }
    output() { return new ArrayBuffer(0); }
  }
  const document = {
    createElement() {
      return {
        width: 200, height: 54,
        getContext() { return { fillText() {}, set font(_value) {}, set fillStyle(_value) {}, set textBaseline(_value) {}, set direction(_value) {}, get direction() { return "rtl"; }, set textAlign(_value) {} }; },
        toDataURL() { return "data:image/png;base64,AA=="; },
      };
    },
  };
  createBarcodeSheet([{ _id: 1, name: "مطرقة", barcode: "12345" }], {
    jsPDFClass: FakePDF, JsBarcode() {}, document, title: "ورقة رموز المنتجات",
  });
  assert.equal(labels.length, 3); // title, name, barcode
});
