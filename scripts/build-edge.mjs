import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.m4a': 'audio/mp4' };
const assets = {};
async function collect(folder) {
  for (const entry of await readdir('dist' + folder, { withFileTypes: true })) {
    const path = folder + '/' + entry.name;
    if (entry.isDirectory()) await collect(path);
    else {
      const type = types[extname(entry.name)];
      if (!type) throw new Error('Unrecognized public asset type: ' + path);
      assets[path] = { type, body: (await readFile('dist' + path)).toString('base64') };
    }
  }
}
await collect('');
await mkdir('build', { recursive: true });
const code = await readFile('server/worker.mjs', 'utf8');
const output = `const assets = ${JSON.stringify(assets)};\n${code}\nexport default createWorker(assets);\n`;
await writeFile('build/edge-worker.mjs', output);
console.log(`Built one ESA worker: ${Object.keys(assets).length} assets, ${(Buffer.byteLength(output) / 1024 / 1024).toFixed(2)} MiB. No database or media bucket needed.`);
