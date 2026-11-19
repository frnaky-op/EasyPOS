import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const output = join(process.cwd(), 'out');
const pages = ['index.html', 'guide/index.html'];

for (const page of pages) {
  const html = readFileSync(join(output, page), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = match[1].replaceAll('&amp;', '&');
    if (!url.startsWith('/')) continue;
    if (basePath && !url.startsWith(`${basePath}/`)) throw new Error(`${page}: missing base path in ${url}`);
    const local = url.slice(basePath.length).split(/[?#]/)[0];
    const target = local.endsWith('/') ? `${local}index.html` : local;
    if (!existsSync(join(output, target))) throw new Error(`${page}: missing ${target}`);
  }
  if (!html.includes('EasyPOS')) throw new Error(`${page}: missing page content`);
}

console.log(`Checked ${pages.length} pages and their local links/assets.`);
