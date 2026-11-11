import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const parent = '@navigation';
const ops = [{ op: 'frame', ref: 'navigation', name: '23 · Navigation commune | Toutes les pages', x: 11200, y: 3300, width: 1440, height: 900, fill: '#F6F8F6', clip: true }];
const rect = (name, x, y, width, height, fill, radius = 0) => ops.push({ op: 'rect', parent, name, x, y, width, height, fill, radius });
const label = (name, characters, x, y, size = 16, color = '#17322D') => ops.push({ op: 'text', parent, name, characters, x, y, size, color, font: { family: 'Inter', style: 'Regular' }, width: 330 });
rect('Topbar', 0, 0, 1440, 56, '#FFFFFF');
rect('Menu button', 18, 9, 38, 38, '#E2F4EA', 9);
label('Menu icon', '☰', 28, 18, 19, '#087A5C');
label('Brand', 'EasyPOS', 91, 17, 19);
label('Section', 'Caisse', 200, 20, 13, '#087A5C');
label('Store', 'Droguerie Générale', 1200, 20, 13, '#6B807B');
rect('Menu panel', 18, 58, 282, 570, '#FFFFFF', 12);
label('Menu title', 'NAVIGATION', 36, 77, 11, '#6B807B');
const groups = [
  ['VENTE', ['Caisse', 'Ventes', 'Commandes', 'Clients']],
  ['CATALOGUE & STOCK', ['Catalogue', 'Stock', 'Achats', 'Catégories']],
  ['ADMINISTRATION', ['Utilisateurs', 'Paramètres']],
];
let y = 112;
for (const [group, items] of groups) {
  label(`${group} heading`, group, 36, y, 11, '#6B807B'); y += 27;
  for (const item of items) {
    if (item === 'Caisse') rect('Active Caisse', 28, y - 4, 262, 39, '#E2F4EA', 8);
    label(`${group} ${item}`, item, 55, y + 5, 14, item === 'Caisse' ? '#087A5C' : '#17322D');
    y += 40;
  }
  y += 12;
}
rect('Sample product card', 326, 180, 190, 180, '#FFFFFF', 10);
rect('Sample product image', 339, 193, 164, 100, '#EAF2ED', 8);
label('Sample product name', 'Perceuse sans fil', 340, 305, 14);
label('Sample product price', '790 MAD', 340, 333, 13, '#087A5C');
fs.writeFileSync(path.join(dir, '23-navigation-commune.json'), JSON.stringify({ ops }, null, 2));
