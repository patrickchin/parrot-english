import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const assets = {};
const sizes = { app: 0, manifests: 0, waveforms: 0 };
let omittedWaveforms = 0;
async function collect(folder) {
  const scene = folder.startsWith('/scenes/')
    ? JSON.parse(await readFile('dist' + folder + '/scene.json', 'utf8'))
    : null;
  for (const entry of await readdir('dist' + folder, { withFileTypes: true })) {
    const path = folder + '/' + entry.name;
    if (entry.isDirectory()) await collect(path);
    else {
      const type = types[extname(entry.name)];
      if (!type) throw new Error('Keep media in object storage, outside the function bundle: ' + path);
      // Scene re-edits leave older envelopes in public; only ship the current one.
      if (scene && /^waveform-.*\.json$/.test(entry.name) && entry.name !== scene.waveform) {
        omittedWaveforms++;
        continue;
      }
      const text = await readFile('dist' + path, 'utf8');
      const body = extname(entry.name) === '.json' ? JSON.stringify(JSON.parse(text)) : text;
      const gzip = gzipSync(body, { level: 9 });
      assets[path] = gzip.length * 4 / 3 < Buffer.byteLength(JSON.stringify(body))
        ? { type, body: gzip.toString('base64'), encoding: 'base64', contentEncoding: 'gzip' }
        : { type, body, encoding: 'utf8' };
      sizes[scene ? entry.name === 'scene.json' ? 'manifests' : 'waveforms' : 'app'] += Buffer.byteLength(JSON.stringify(path) + ':' + JSON.stringify(assets[path]) + ',');
    }
  }
}
await collect('');
await mkdir('build', { recursive: true });
const code = await readFile('server/worker.mjs', 'utf8');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const output = `const assets = ${JSON.stringify(assets)};\n${code}\nexport default createWorker(assets, ${JSON.stringify(revision)});\n`;
const bytes = Buffer.byteLength(output), budget = 4 * 1024 * 1024;
if (bytes > budget) throw new Error('ESA application exceeds the 4 MiB code budget; review structured-asset delivery before adding more scenes.');
await writeFile('build/edge-worker.mjs', output);
console.log(`Built ESA application: ${Object.keys(assets).length} assets, ${(bytes / 1024 / 1024).toFixed(2)} / 4.00 MiB (${((budget - bytes) / 1024 / 1024).toFixed(2)} MiB free). Media loads separately from OSS.`);
console.log(`Embedded sizes: ${Object.entries(sizes).map(([group, size]) => `${group} ${(size / 1024).toFixed(1)} KiB`).join(', ')}. Omitted ${omittedWaveforms} obsolete waveforms.`);
