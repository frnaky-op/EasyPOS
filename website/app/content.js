import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function getPageHtml(filename) {
  const source = readFileSync(join(process.cwd(), filename), 'utf8');
  const body = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  if (!body) throw new Error(`Missing body in ${filename}`);
  return body
    .replace(/\b(?:src|href)="images\//g, match => match.replace('images/', `${basePath}/images/`))
    .replace(/\bhref="guide\.html"/g, `href="${basePath}/guide/"`)
    .replace(/\bhref="index\.html(#[^"]*)?"/g, (_, hash = '') => `href="${basePath}/${hash}"`);
}
