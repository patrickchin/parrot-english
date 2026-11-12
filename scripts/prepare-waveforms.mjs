import { catalog, sceneFolder, writeCatalog } from './content-paths.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const rate = 16000, step = 0.005;
for (const slug of process.argv.slice(2).length ? process.argv.slice(2) : catalog.map(entry => entry.slug)) {
  const folder = sceneFolder(slug);
  const scene = JSON.parse(await readFile(`${folder}/scene.json`, 'utf8'));
  const source = `${slug === 'sintel' ? 'content/media/sintel' : 'content/local-dubbing'}/${scene.video}`;
  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', source, '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1'], { maxBuffer: 16 * 1024 * 1024 });
  if (decoded.status !== 0) throw new Error(`Cannot decode ${source}: ${decoded.stderr}`);
  const samples = decoded.stdout;
  const peaks = Array.from({ length: Math.ceil(scene.duration / step) }, (_, index) => {
    let peak = 0;
    for (let j = index * rate * step; j < (index + 1) * rate * step && j * 4 < samples.length; j++) { const sample = samples.readFloatLE(j * 4); peak = Math.max(peak, Math.abs(sample)); }
    return Number(Math.min(1, peak).toFixed(5));
  });
  scene.waveform ??= 'waveform-v2.json';
  await writeFile(`${folder}/${scene.waveform}`, JSON.stringify({ version: 2, duration: scene.duration, step, peaks }) + '\n');
  if (slug !== 'sintel') {
    scene.poster ??= `${slug}-poster-v1.jpg`;
    const still = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(Math.min(scene.duration / 2, slug === 'patrick' ? 5.8 : 1)), '-i', source, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '3', '-y', `content/local-dubbing/${scene.poster}`]);
    if (still.status !== 0) throw new Error(`Cannot prepare ${scene.poster}`);
  }
  await writeFile(`${folder}/scene.json`, JSON.stringify(scene, null, 2) + '\n');
  console.log(`${slug}: ${peaks.length} peak windows; media stays outside the app bundle.`);
}

await writeCatalog(catalog);
