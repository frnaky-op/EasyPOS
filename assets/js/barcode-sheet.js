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

function createBarcodeSheet(products, { jsPDFClass, JsBarcode, document, title = "Product barcode sheet" }) {
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

  function writeLabel(value, x, y, width, size, bold = false) {
    if (!/[^\x20-\x7e]/.test(value)) {
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      pdf.setFontSize(size);
      pdf.text(pdf.splitTextToSize(value, width).slice(0, 2), x, y);
      return;
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext && canvas.getContext("2d");
    if (!context) {
      pdf.text(value, x, y);
      return;
    }
    canvas.width = 1200;
    canvas.height = 120;
    context.font = `${bold ? "bold " : ""}54px Arial, sans-serif`;
    context.fillStyle = "#17322d";
    context.textBaseline = "middle";
    context.direction = /[\u0600-\u06ff]/.test(value) ? "rtl" : "ltr";
    context.textAlign = context.direction === "rtl" ? "right" : "left";
    context.fillText(value, context.direction === "rtl" ? 1180 : 20, 60, 1160);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y - size * 0.42, width, size * 0.65);
  }

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
      writeLabel(title, margin, 12, 100, 13, true);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text(`${page + 1} / ${pageCount}`, pageWidth - margin, 12, { align: "right" });
    }

    pdf.setDrawColor(218, 226, 221);
    pdf.roundedRect(x, y, cellWidth, cellHeight - 2, 2, 2, "S");
    writeLabel(name, x + 4, y + 5, cellWidth - 8, 9, true);

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
