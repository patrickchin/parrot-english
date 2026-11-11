import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { execFileSync } from 'node:child_process';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const assets = {};
async function collect(folder) {
  for (const entry of await readdir('dist' + folder, { withFileTypes: true })) {
    const path = folder + '/' + entry.name;
    if (entry.isDirectory()) await collect(path);
    else {
      const type = types[extname(entry.name)];
      if (!type) throw new Error('Keep media in object storage, outside the function bundle: ' + path);
      const text = await readFile('dist' + path, 'utf8');
      const body = extname(entry.name) === '.json' ? JSON.stringify(JSON.parse(text)) : text;
      assets[path] = { type, body, encoding: 'utf8' };
    }
  }
}
await collect('');
await mkdir('build', { recursive: true });
const code = await readFile('server/worker.mjs', 'utf8');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const output = `const assets = ${JSON.stringify(assets)};\n${code}\nexport default createWorker(assets, ${JSON.stringify(revision)});\n`;
if (Buffer.byteLength(output) > 4 * 1024 * 1024) throw new Error('ESA application exceeds the 4 MiB code budget; review structured-asset delivery before adding more scenes.');
await writeFile('build/edge-worker.mjs', output);
console.log(`Built ESA application: ${Object.keys(assets).length} app assets, ${(Buffer.byteLength(output) / 1024 / 1024).toFixed(2)} MiB. Media loads separately from OSS.`);
