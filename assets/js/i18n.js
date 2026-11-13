const fs = require("fs");
const path = require("path");
const catalogs = { fr: {}, en: {}, ar: {} };
for (const line of fs.readFileSync(path.join(__dirname, "../i18n/catalog.tsv"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const [source, english, arabic] = line.split("\t");
  if (source && english && arabic) {
    catalogs.en[source] = english;
    catalogs.ar[source] = arabic;
  }
}
for (const line of fs.readFileSync(path.join(__dirname, "../i18n/french-overrides.tsv"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const [source, french] = line.split("\t");
  if (source && french) catalogs.fr[source] = french;
}
const supported = ["fr", "ar", "en"];
let language = "fr";
let observer;

function setLanguage(value) {
  language = supported.includes(value) ? value : "fr";
  return language;
}

function getLanguage() { return language; }
function t(source) { return catalogs[language]?.[source] || source; }

function tf(source, values) {
  return t(source).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}

function translateText(node) {
  if (!node || !node.nodeValue) return;
  if (node.parentElement?.closest("[data-no-i18n], [translate='no']")) return;
  const original = node.nodeValue;
  const trimmed = original.trim();
  if (!trimmed) return;
  const translated = t(trimmed);
  if (translated !== trimmed) node.nodeValue = original.replace(trimmed, translated);
}

function translateElement(element) {
  if (element.nodeType !== 1 || element.closest("[data-no-i18n], [translate='no']")) return;
  for (const attr of ["placeholder", "title", "aria-label"]) {
    if (!element.hasAttribute(attr)) continue;
    const value = element.getAttribute(attr);
    const translated = t(value);
    if (translated !== value) element.setAttribute(attr, translated);
  }
  for (const node of element.childNodes) {
    if (node.nodeType === 3) translateText(node);
    else if (node.nodeType === 1) translateElement(node);
  }
}

function initI18n(document, selectedLanguage) {
  setLanguage(selectedLanguage);
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  if (observer) observer.disconnect();
  translateElement(document.body);
  observer = new document.defaultView.MutationObserver(records => {
    for (const record of records) {
      if (record.type === "characterData") translateText(record.target);
      else if (record.type === "attributes") translateElement(record.target);
      else for (const node of record.addedNodes) {
        if (node.nodeType === 3) translateText(node);
        else if (node.nodeType === 1) translateElement(node);
      }
    }
  });
  observer.observe(document.body, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ["placeholder", "title", "aria-label"],
  });
  return language;
}

module.exports = { supported, setLanguage, getLanguage, t, tf, initI18n };
