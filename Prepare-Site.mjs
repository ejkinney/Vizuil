import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = new URL('./Web/', import.meta.url);
const dist = new URL('./Site/dist/', import.meta.url);
const index = await readFile(new URL('index.html', web), 'utf8');
if (!index.includes('<body>')) throw new Error('Could not enable Site mode in Web/index.html.');
const files = (await readdir(web, { withFileTypes: true }))
  .filter(entry => entry.isFile() && /\.(mjs|css|svg)$/.test(entry.name))
  .map(entry => entry.name).sort();
const hash = createHash('sha256').update(index);
for (const name of files) hash.update(name).update(await readFile(new URL(name, web)));
const release = `release-${hash.digest('hex').slice(0, 12)}`;
const assetRoot = new URL('assets/', dist);
if (path.dirname(path.resolve(fileURLToPath(assetRoot))) !== path.resolve(fileURLToPath(dist))) {
  throw new Error('Site assets must stay inside Site/dist.');
}
await rm(assetRoot, { recursive: true, force: true });
const assets = new URL(`assets/${release}/`, dist);
await mkdir(assets, { recursive: true });
await writeFile(new URL('index.html', dist), index
  .replace('<body>', '<body data-mode="site">')
  .replaceAll('/assets/', `/assets/${release}/`));
for (const name of files) await copyFile(new URL(name, web), new URL(name, assets));
await copyFile(new URL('demo/dadon.flac', web), new URL('dadon.flac', assets));
