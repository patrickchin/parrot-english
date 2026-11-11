// Local review cuts only; original media and generated files remain Git-ignored.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const recipe = JSON.parse(await readFile('content/tv-review-scenes.json', 'utf8'));
const checkOnly = process.argv.includes('--check');
const metadataOnly = process.argv.includes('--metadata-only');
const selected = process.argv.slice(2).filter(arg => !['--check', '--metadata-only'].includes(arg));
const selectedScenes = recipe.scenes.filter(scene => !selected.length || selected.includes(scene.slug));
if (!selectedScenes.length) throw new Error('No selected TV conversations.');
const root = 'content/local-dubbing/review';
const timestamp = seconds => new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23);
const ids = new Set();
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`${command}: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
};
const probe = file => JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));

for (const scene of selectedScenes) {
  const source = recipe.sources.find(source => source.id === scene.sourceId);
  if (!source || !['older-children', 'teens'].includes(scene.cohort) || !/^[a-z0-9-]+$/.test(scene.slug)) throw new Error(`Invalid source or scene: ${scene.slug}`);
  if (scene.end - scene.start < 10 || scene.end - scene.start > 40 || scene.start < 0 || scene.end > source.duration || scene.roles.length < 2 || scene.observedDialogueTurnsAtLeast < 3) throw new Error(`Needs a complete dialogue exchange: ${scene.slug}`);
  for (const record of [scene, ...scene.roles]) {
    if (!/^(clip|role)_[A-Za-z0-9_-]+$/.test(record.id) || ids.has(record.id)) throw new Error(`Invalid or repeated ID: ${record.id}`);
    ids.add(record.id);
  }
  const folder = `${root}/${scene.cohort}`;
  const output = `${folder}/${scene.slug}.mp4`;
  await mkdir(folder, { recursive: true });
  if (!checkOnly && !metadataOnly) run('ffmpeg', ['-v', 'error', '-ss', String(scene.start), '-i', source.localFile, '-t', String(scene.end - scene.start), '-map', '0:v:0', '-map', '0:a:0', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', output]);
  if (!checkOnly && scene.lines?.length) await writeFile(`${folder}/${scene.slug}.vtt`, 'WEBVTT\n\n' + scene.lines.map((line, index) => `${index + 1}\n${timestamp(line.start - scene.start)} --> ${timestamp(line.end - scene.start)}\n${line.text}\n${line.hint}\n`).join('\n'));
  const media = probe(output);
  if (Math.abs(Number(media.format.duration) - (scene.end - scene.start)) > 0.15 || !media.streams.some(s => s.codec_type === 'audio') || !media.streams.some(s => s.codec_type === 'video')) throw new Error(`Incomplete clip: ${output}`);
  run('ffmpeg', ['-v', 'error', '-i', output, '-f', 'null', '-']);
  console.log(`Checked ${scene.slug}: ${Number(media.format.duration).toFixed(3)} s, ${scene.roles.length} characters, at least ${scene.observedDialogueTurnsAtLeast} turns`);
  if (!checkOnly) await writeFile(`${folder}/${scene.slug}.txt`, `${scene.title}\n${scene.titleZh}\n\n${source.series} — ${source.episode}\n${source.url}&t=${Math.floor(scene.start)}s\nSource range: ${scene.start}–${scene.end} seconds\nUpload: ${source.uploadTitle}\nChannel: ${source.channel}${source.officialChannel ? ' (official)' : ' (fan upload)'}\nOriginal work: ${source.attribution}\n\nCharacters: ${scene.roles.map(r => r.name).join(', ')}\nDialogue: at least ${scene.observedDialogueTurnsAtLeast} character turns\nSummary: ${scene.summary}\nPractice: ${scene.practice}\nContent notes: ${scene.contentNotes}\n\n${recipe.ageGuidance[scene.cohort]}\nStatus: ${scene.reviewStatus}\nPrivate review only; redistribution is not cleared. Original English audio; no generated speech. Bilingual subtitles are in the matching VTT file.\n`);
}

if (!checkOnly) for (const cohort of ['older-children', 'teens']) {
  const scenes = recipe.scenes.filter(scene => scene.cohort === cohort);
  const index = [];
  for (const scene of scenes) {
    const file = `${scene.slug}.mp4`;
    const sha256 = createHash('sha256').update(await readFile(`${root}/${cohort}/${file}`)).digest('hex');
    index.push({ ...scene, file, duration: +(scene.end - scene.start).toFixed(3), sha256, source: recipe.sources.find(source => source.id === scene.sourceId) });
  }
  await writeFile(`${root}/${cohort}/index.json`, JSON.stringify(index, null, 2) + '\n');
  await writeFile(`${root}/${cohort}/play-all.m3u8`, '#EXTM3U\n' + index.map(scene => `#EXTINF:${scene.duration},${scene.title}\n${scene.file}`).join('\n') + '\n');
  await writeFile(`${root}/${cohort}/README.txt`, `${cohort.toUpperCase()} — TV CONVERSATIONS\n\n${recipe.ageGuidance[cohort]}\n${index.length} continuous multi-character scenes. Open individual MP4s or play-all.m3u8.\nOriginal English audio is preserved. Matching TXT files contain summaries, source links and content notes; matching VTT files provide bilingual dialogue. Adult listening and suitability review remain pending.\nPrivate local review; redistribution is not cleared. The owner approved these scenes for the existing internal test deployment.\n\n` + index.map(scene => `${scene.file} — ${scene.duration.toFixed(2)} s\n${scene.title} / ${scene.titleZh}\n${scene.roles.map(role => role.name).join(', ')}\n${scene.summary}\n`).join('\n'));
}
