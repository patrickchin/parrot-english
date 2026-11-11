// Build reviewed TV scenes; media is uploaded separately to OSS.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const recipe = JSON.parse(await readFile('content/tv-review-scenes.json', 'utf8'));
const selected = process.argv.slice(2);
const scenes = recipe.scenes.filter(entry => !selected.length || selected.includes(entry.slug));
if (!scenes.length) throw new Error('No selected TV conversations.');
const local = 'content/local-dubbing';
const output = `${local}/tv-release`;
const root = 'https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/clips/';
const names = { Sheldon: '谢尔顿', Librarian: '图书管理员', 'George Cooper Sr.': '乔治爸爸', Rachel: '瑞秋', Ross: '罗斯', Chandler: '钱德勒', 'Rachel and Chandler': '瑞秋和钱德勒', Joey: '乔伊', Barney: '巴尼', Ted: '泰德', Marshall: '马修', Robin: '罗宾', Lily: '莉莉', Missy: '米茜', Georgie: '小乔治', Mandy: '曼迪', 'Dr. Sturgis': '斯特吉斯博士', Researcher: '研究员', Harry: '哈利', Ron: '罗恩', 'Shop assistant': '店员', Monica: '莫妮卡', Penny: '佩妮', Leonard: '莱纳德', Amy: '艾米', 'Barney and Marshall': '巴尼和马修' };
const translations = Object.fromEntries(Object.entries(names).map(([en, zh]) => [zh, en]));
const media = [], entries = [], slugs = [];
await mkdir(output, { recursive: true });
for (const entry of scenes) {
  const slug = entry.publicSlug;
  let previous;
  try { previous = JSON.parse(await readFile(`public/scenes/${slug}/scene.json`, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!entry.sceneId || !entry.lines?.length || !entry.lines.every(line => line.words?.length)) throw new Error(`Align the dialogue before preparing ${slug}`);
  const source = recipe.sources.find(source => source.id === entry.sourceId);
  const original = `${local}/review/${entry.cohort}/${entry.slug}.mp4`;
  const hash = createHash('sha256').update(await readFile(original)).digest('hex').slice(0, 12);
  const video = `${slug}-review-${hash}.mp4`;
  await copyFile(original, `${local}/${video}`);
  const duration = +Number(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', original], { encoding: 'utf8' })).format.duration).toFixed(3);
  const scene = {
    version: 1, id: entry.sceneId, title: entry.titleZh,
    description: '内部原型测试；选角色，听原声，录下自己的版本。',
    duration, video, mediaBase: `${root}${slug}/`,
    poster: `${slug}-poster-${hash}.jpg`, waveform: `waveform-${hash}.json`,
    roles: entry.roles.map(role => {
      const count = entry.lines.filter(line => line.roleId === role.id).length;
      const hint = `${count} 句台词`;
      translations[hint] = `${count} ${count === 1 ? 'line' : 'lines'}`;
      const portrait = previous?.roles.find(old => old.id === role.id)?.portrait;
      return { id: role.id, name: names[role.name] ?? role.name, label: names[role.name] ?? role.name, hint, ...(portrait ? { portrait } : {}), ...(role.selectable === false ? { selectable: false } : {}) };
    }),
    lines: entry.lines.map(line => ({ id: line.id, roleId: line.roleId, start: +(line.start - entry.start).toFixed(3), end: +(line.end - entry.start).toFixed(3), text: line.text, hint: line.hint, words: line.words.map(word => ({ ...word, start: +(word.start - entry.start).toFixed(3), end: +(word.end - entry.start).toFixed(3) })) })),
    wordTiming: entry.wordTiming, rightsStatus: recipe.rightsStatus,
    credit: { title: `${source.series} — ${source.episode}`, attribution: source.attribution, source: `${source.url}&t=${Math.floor(entry.start)}s`, licence: '未确认再分发许可', licenceUrl: 'https://www.youtube.com/howyoutubeworks/policies/copyright/', changes: `内部原型测试；原上传 ${entry.start}–${entry.end} 秒的连续节选。${entry.contentNotes}` },
  };
  await mkdir(`public/scenes/${slug}`, { recursive: true });
  await writeFile(`public/scenes/${slug}/scene.json`, JSON.stringify(scene, null, 2) + '\n');
  translations[entry.titleZh] = entry.title;
  entries.push({ slug, title: entry.titleZh, english: entry.title, note: source.series, source: scene.credit.source, cohort: entry.cohort, poster: scene.mediaBase + scene.poster });
  slugs.push(slug);
  media.push({ file: `${local}/${video}`, key: `clips/${slug}/${video}` }, { file: `${local}/${scene.poster}`, key: `clips/${slug}/${scene.poster}` });
}
const catalog = JSON.parse(await readFile('src/review-clips.json', 'utf8')).filter(clip => !slugs.includes(clip.slug));
await writeFile('src/review-clips.json', JSON.stringify([...catalog, ...entries], null, 2) + '\n');
await writeFile(`${output}/media.json`, JSON.stringify(media, null, 2) + '\n');
await writeFile(`${output}/translations.json`, JSON.stringify(translations, null, 2) + '\n');
execFileSync(process.execPath, ['scripts/prepare-waveforms.mjs', ...slugs], { stdio: 'inherit' });
console.log(`Prepared ${slugs.length} TV scenes and ${media.length} OSS media objects.`);
