// Private authoring only. Source files and every output stay outside the app build.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const [cohort, ...args] = process.argv.slice(2);
const captionsOnly = args.includes('--captions-only');
const selected = args.filter(arg => arg !== '--captions-only');
const recipeFiles = {
  'younger-age-5': 'content/preschool-review-scenes.json',
  'older-audience': 'content/meme-review-scenes.json',
  'social-memes': 'content/social-meme-review-scenes.json',
};
if (!Object.hasOwn(recipeFiles, cohort)) throw new Error('Usage: node scripts/prepare-review-clips.mjs <younger-age-5|older-audience|social-memes> [slug ...|--check]');
// Short memes can be complete exchanges or solo performances; keep the original speakers.
const social = cohort === 'social-memes';
const recipe = JSON.parse(await readFile(recipeFiles[cohort], 'utf8'));
const root = `content/local-dubbing/review/${cohort}`;
const checkOnly = selected.includes('--check');
await mkdir(root, { recursive: true });
const timestamp = seconds => new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23);
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`${command}: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
};

for (const scene of recipe.scenes.filter(s => !selected.length || checkOnly || selected.includes(s.slug))) {
  const source = recipe.sources.find(s => s.id === scene.sourceId);
  if (!source || !/^[\w-]+$/.test(scene.slug) || !/^[\w-]+$/.test(source.id)) throw new Error(`Invalid source or slug: ${scene.slug}`);
  if (!(scene.end > scene.start) || !scene.lines.length || scene.lines.some(l => l.start < scene.start || l.end > scene.end || l.end <= l.start)) throw new Error(`Invalid timings: ${scene.slug}`);
  const sourceLink = source.url.includes('youtube.com/') ? `${source.url}&t=${Math.floor(scene.start + (source.sourceOffset ?? 0))}s` : source.url;
  const roles = new Map(scene.roles?.map(r => [r.id, r.name]));
  if (scene.lines.some(line => roles.get(line.roleId) !== line.speaker)) throw new Error(`Speaker name and role disagree: ${scene.slug}`);
  const turns = scene.lines.map(l => l.roleId).filter((id, i, all) => !i || id !== all[i - 1]);
  if (scene.end - scene.start < (social ? 1 : 10) || scene.end - scene.start > 40 || new Set(turns).size < (social ? 1 : 2) || turns.length < (social ? 1 : cohort === 'older-audience' ? 2 : 3) || scene.lines.length < (social ? 1 : 3) || scene.lines.some(l => !roles.has(l.roleId) || /narrator|reference voice|children/i.test(roles.get(l.roleId)))) throw new Error(`Needs a complete character exchange: ${scene.slug}`);
  const file = scene.file ?? `${scene.slug}.mp4`;
  if (!checkOnly && !captionsOnly && !scene.preserveMedia) run('ffmpeg', ['-v', 'error', '-ss', String(scene.start), '-i', source.localFile ?? `${root}/sources/${source.id}.mp4`, '-t', String(scene.end - scene.start), '-map', '0:v:0', '-map', '0:a:0', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', `${root}/${file}`]);
  const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', `${root}/${file}`]));
  const duration = Number(probe.format.duration);
  if (Math.abs(duration - (scene.end - scene.start)) > 0.15 || !probe.streams.some(s => s.codec_type === 'audio') || !probe.streams.some(s => s.codec_type === 'video')) throw new Error(`Incomplete clip: ${file}`);
  if (checkOnly) {
    run('ffmpeg', ['-v', 'error', '-i', `${root}/${file}`, '-f', 'null', '-']);
    const vtt = await readFile(`${root}/${scene.slug}.vtt`, 'utf8');
    if (!vtt.startsWith('WEBVTT\n') || vtt.split(' --> ').length - 1 !== scene.lines.length || scene.lines.some(l => !vtt.includes(l.text) || !vtt.includes(l.hint))) throw new Error(`Incomplete captions: ${file}`);
    console.log(`Checked ${file}: ${duration.toFixed(3)}s, ${roles.size} characters, ${turns.length} dialogue turns`);
    continue;
  }
  const lines = scene.lines.map(l => ({ ...l, start: +(l.start - scene.start).toFixed(3), end: +(l.end - scene.start).toFixed(3) }));
  await writeFile(`${root}/${scene.slug}.vtt`, 'WEBVTT\n\n' + lines.map((l, i) => `${i + 1}\n${timestamp(l.start)} --> ${timestamp(l.end)}\n${l.text}\n${l.hint}\n`).join('\n'));
  await writeFile(`${root}/${scene.slug}.txt`, `${scene.title}\n${scene.titleZh}\nPractice: ${scene.practice ?? scene.editNote}\nReview: ${scene.reviewStatus ?? 'adult-review-pending'}\nSource: ${sourceLink}\nSource cut: ${scene.start + (source.sourceOffset ?? 0)}–${scene.end + (source.sourceOffset ?? 0)}s${source.kind === 'prepared-benchmark' ? `; preserved prepared benchmark. Original edits: ${source.changes}` : ''}\n${source.attribution}\nRights: redistribution-not-cleared; private review only.\n\n` + lines.map(l => `${l.speaker}: ${l.text}\n${l.hint}\n`).join('\n'));
  console.log(`${file}: ${duration.toFixed(3)}s, ${roles.size} characters, ${turns.length} dialogue turns`);
}

if (!selected.length) {
  const index = recipe.scenes.map(s => ({ ...s, file: s.file ?? `${s.slug}.mp4`, duration: +(s.end - s.start).toFixed(3), characters: s.roles.length, dialogueTurns: s.lines.filter((l, i, all) => !i || l.roleId !== all[i - 1].roleId).length, formatReview: s.preserveMedia ? 'user-selected-benchmark' : 're-edited', subtitles: `${s.slug}.vtt`, source: recipe.sources.find(source => source.id === s.sourceId), rightsStatus: recipe.rightsStatus, reviewStatus: s.reviewStatus ?? 'adult-review-pending' }));
  await writeFile(`${root}/index.json`, JSON.stringify(index, null, 2) + '\n');
  await writeFile(`${root}/play-all.m3u8`, '#EXTM3U\n' + index.map(s => `#EXTINF:${(s.end - s.start).toFixed(2)},${s.title}\n${s.file}`).join('\n') + '\n');
  if (cohort === 'younger-age-5') await writeFile(`${root}/README.txt`, `YOUNGER AUDIENCE — AROUND AGE FIVE\n\n${index.length} continuous Peppa Pig and Ben and Holly dialogue scenes for private adult review.\nEvery scene has at least two speaking characters and three dialogue turns.\nOpen any MP4 in QuickTime/Finder, or play-all.m3u8 in a playlist-capable player.\nEach MP4 has a matching bilingual .vtt subtitle and .txt dialogue/source record.\nSuggested age fit is an editorial starting point, not a formal age rating.\nAdult review of speech, pacing and suitability remains pending.\nRights: redistribution-not-cleared.\n\n` + index.map((s, i) => `${String(i + 1).padStart(2, '0')}. ${s.title} / ${s.titleZh}\n    ${s.file} — ${(s.end - s.start).toFixed(2)} seconds\n    Characters: ${s.roles.map(r => r.name).join(', ')}\n    ${s.practice}\n`).join('\n'));
}

if (!selected.length && cohort === 'older-audience') await writeFile(`${root}/README.txt`, `OLDER AUDIENCE — COMPLETE DIALOGUE SCENES\n\n24 review scenes: 21 expanded or replaced edits and 3 preserved user-selected benchmarks.\nEach scene has multiple speaking characters and several dialogue lines.\nOpen individual MP4s or play-all.m3u8; bilingual VTT and dialogue/source notes accompany each.\nOriginal short cuts are archived in superseded-short-cuts/.\nSource, role and line details are in index.json.\nLocal private review only. Redistribution is not cleared.\n`);
