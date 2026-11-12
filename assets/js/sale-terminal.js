function saleTerminal(platform, settings) {
  const mode = platform?.app || settings?.app || "Standalone Point of Sale";
  const till = Number(platform?.till);
  if (mode === "Network Point of Sale Terminal" && (!Number.isSafeInteger(till) || till < 2)) {
    throw new Error("Configurez le numéro de caisse de ce terminal dans les paramètres avant de confirmer la vente.");
  }
  return {
    till: Number.isSafeInteger(till) && till > 0 ? till : 1,
    mac: String(platform?.mac || ""),
  };
}

module.exports = { saleTerminal };
