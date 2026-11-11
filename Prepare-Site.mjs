import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const web = new URL('./Web/', import.meta.url);
const dist = new URL('./Site/dist/', import.meta.url);
const assets = new URL('assets/', dist);
await mkdir(assets, { recursive: true });

const index = await readFile(new URL('index.html', web), 'utf8');
if (!index.includes('<body>')) throw new Error('Could not enable Site mode in Web/index.html.');
await writeFile(new URL('index.html', dist), index.replace('<body>', '<body data-mode="site">'));

for (const entry of await readdir(web, { withFileTypes: true })) {
  if (entry.isFile() && /\.(mjs|css|svg)$/.test(entry.name)) {
    await copyFile(new URL(entry.name, web), new URL(entry.name, assets));
  }
}
