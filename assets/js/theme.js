const themeIds = ["classic", "atelier", "ocean", "terracotta", "indigo"];

function applyTheme(document, selected) {
  const theme = themeIds.includes(selected) ? selected : "classic";
  document.documentElement.dataset.theme = theme;
  return theme;
}

module.exports = { themeIds, applyTheme };
