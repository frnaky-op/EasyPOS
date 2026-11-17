const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const output = path.join(__dirname, 'www');
fs.mkdirSync(output, { recursive: true });

const copy = (source, target) => {
  const destination = path.join(output, target);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, source), destination);
};

let html = fs.readFileSync(path.join(root, 'mobile', 'index.html'), 'utf8');
html = html.replace(/(src|href)="\//g, '$1="./');
html = html.replace('<script defer src="./app.js"></script>', '<script defer src="./native-bridge.js"></script>\n  <script defer src="./app.js"></script>');
html = html.replace('<link rel="stylesheet" href="./app.css">', '<link rel="stylesheet" href="./app.css">\n  <link rel="stylesheet" href="./native.css">');
fs.writeFileSync(path.join(output, 'index.html'), html);

copy('mobile/app.css', 'app.css');
copy('mobile/app.js', 'app.js');
copy('mobile/pairing.js', 'pairing.js');
copy('assets/i18n/catalog.tsv', 'catalog.tsv');
copy('assets/images/easypos-logo-concept.png', 'logo.png');
copy('node_modules/@zxing/browser/umd/zxing-browser.min.js', 'scanner.js');
for (const name of fs.readdirSync(path.join(root, 'assets', 'icons', 'lucide'))) {
  if (name.endsWith('.svg')) copy(`assets/icons/lucide/${name}`, `icons/${name}`);
}
copy('companion/native.css', 'native.css');

esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'native-bridge.js')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  outfile: path.join(output, 'native-bridge.js'),
});
