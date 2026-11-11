const COLUMNS = 2;
const ROWS = 7;
const PER_PAGE = COLUMNS * ROWS;

function barcodeValue(product) {
  const stored = String(product.barcode || "").trim();
  if (stored && stored.length <= 80 && /^[\x20-\x7e]+$/.test(stored)) return stored;
  const id = String(product._id || "").trim();
  if (!id || !/^[0-9]+$/.test(id)) throw new Error("Product has no printable barcode or numeric ID.");
  return id;
}

function createBarcodeSheet(products, { jsPDFClass, JsBarcode, document }) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error("Select at least one product.");
  }
  const pdf = new jsPDFClass({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const margin = 12;
  const gap = 6;
  const cellWidth = (pageWidth - 2 * margin - gap) / COLUMNS;
  const cellHeight = 38;
  const top = 19;
  const pageCount = Math.ceil(products.length / PER_PAGE);

  products.forEach((product, index) => {
    const page = Math.floor(index / PER_PAGE);
    if (index > 0 && index % PER_PAGE === 0) pdf.addPage();
    const position = index % PER_PAGE;
    const column = position % COLUMNS;
    const row = Math.floor(position / COLUMNS);
    const x = margin + column * (cellWidth + gap);
    const y = top + row * cellHeight;
    const name = String(product.name || "Unnamed product").trim();
    const code = barcodeValue(product);

    if (position === 0) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.text("Product barcode sheet", margin, 12);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text(`${page + 1} / ${pageCount}`, pageWidth - margin, 12, { align: "right" });
    }

    pdf.setDrawColor(218, 226, 221);
    pdf.roundedRect(x, y, cellWidth, cellHeight - 2, 2, 2, "S");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    const lines = pdf.splitTextToSize(name, cellWidth - 8).slice(0, 2);
    pdf.text(lines, x + 4, y + 5);

    const canvas = document.createElement("canvas");
    JsBarcode(canvas, code, {
      format: "CODE128", displayValue: false, width: 2, height: 54,
      margin: 0, background: "#ffffff", lineColor: "#000000",
    });
    const maxBarcodeWidth = cellWidth - 10;
    const barcodeHeight = 16;
    const imageWidth = Math.min(maxBarcodeWidth, canvas.width / canvas.height * barcodeHeight);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", x + (cellWidth - imageWidth) / 2, y + 13,
      imageWidth, barcodeHeight);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(code, x + cellWidth / 2, y + 33, { align: "center" });
  });

  return { pageCount, productCount: products.length, data: pdf.output("arraybuffer") };
}

module.exports = { barcodeValue, createBarcodeSheet, PER_PAGE };
