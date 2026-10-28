import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const rate = 16000, step = 0.02;
for (const slug of ['patrick', 'chocolate', 'wumbo', 'onions', 'sintel']) {
  const folder = `public/packs/${slug}`;
  const pack = JSON.parse(await readFile(`${folder}/pack.json`, 'utf8'));
  const source = `${slug === 'sintel' ? 'content/media/sintel' : 'content/local-dubbing'}/${pack.video}`;
  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', source, '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1'], { maxBuffer: 16 * 1024 * 1024 });
  if (decoded.status !== 0) throw new Error(`Cannot decode ${source}: ${decoded.stderr}`);
  const samples = decoded.stdout;
  const peaks = Array.from({ length: Math.ceil(pack.duration / step) }, (_, index) => {
    let sum = 0, count = 0;
    for (let j = index * rate * step; j < (index + 1) * rate * step && j * 4 < samples.length; j++) { const sample = samples.readFloatLE(j * 4); sum += sample * sample; count++; }
    return Number(Math.min(1, count ? Math.sqrt(sum / count) : 0).toFixed(5));
  });
  pack.waveform = 'waveform-v1.json';
  await writeFile(`${folder}/${pack.waveform}`, JSON.stringify({ version: 1, duration: pack.duration, step, peaks }) + '\n');
  if (slug !== 'sintel') {
    pack.poster = `${slug}-poster-v1.jpg`;
    const still = spawnSync('ffmpeg', ['-v', 'error', '-ss', slug === 'patrick' ? '5.8' : '1', '-i', source, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '3', '-y', `content/local-dubbing/${pack.poster}`]);
    if (still.status !== 0) throw new Error(`Cannot prepare ${pack.poster}`);
  }
  await writeFile(`${folder}/pack.json`, JSON.stringify(pack, null, 2) + '\n');
  console.log(`${slug}: ${peaks.length} RMS windows; media stays outside the app bundle.`);
}
