import { catalog as existingCatalog, sceneFolder, writeCatalog } from './content-paths.mjs';
// Build reviewed dialogue scenes; media is uploaded separately to OSS.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const preschool = process.argv.includes('--preschool');
const args = process.argv.slice(2);
const recipeIndex = args.indexOf('--recipe');
if (recipeIndex >= 0 && !args[recipeIndex + 1]) throw new Error('--recipe requires an authoring JSON path');
const recipePath = recipeIndex >= 0 ? args[recipeIndex + 1] : preschool ? 'content/preschool-review-scenes.json' : 'content/tv-review-scenes.json';
const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
const selected = args.filter((arg, index) => arg !== '--preschool' && (recipeIndex < 0 || index !== recipeIndex && index !== recipeIndex + 1));
const scenes = recipe.scenes.filter(entry => !selected.length || selected.includes(entry.slug));
if (!scenes.length) throw new Error('No selected conversations.');
const local = 'content/local-dubbing';
const output = `${local}/${recipeIndex >= 0 ? 'review-release' : preschool ? 'preschool-release' : 'tv-release'}`;
const root = 'https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/clips/';
const names = { Sheldon: '谢尔顿', Librarian: '图书管理员', 'George Cooper Sr.': '乔治爸爸', Rachel: '瑞秋', Ross: '罗斯', Chandler: '钱德勒', 'Rachel and Chandler': '瑞秋和钱德勒', Joey: '乔伊', Barney: '巴尼', Ted: '泰德', Marshall: '马修', Robin: '罗宾', Lily: '莉莉', Missy: '米茜', Georgie: '小乔治', Mandy: '曼迪', 'Dr. Sturgis': '斯特吉斯博士', Researcher: '研究员', Harry: '哈利', Ron: '罗恩', 'Shop assistant': '店员', Monica: '莫妮卡', Penny: '佩妮', Leonard: '莱纳德', Amy: '艾米', 'Barney and Marshall': '巴尼和马修', Peppa: '佩奇', 'Daddy Pig': '猪爸爸', 'Mummy Pig': '猪妈妈', Holly: '霍莉', Ben: '本', 'Nanny Plum': '梅姨', Bluey: '布鲁伊', Bandit: '班迪特爸爸', Chilli: '奇莉妈妈', Teacher: '老师', Class: '同学们', Kate: '凯特', 'Child in blue': '蓝衣小朋友', 'Child in purple': '紫衣小朋友', Dog: '小狗', Sally: '萨莉', Gogo: 'Gogo', Tony: '托尼', Jenny: '珍妮', 'Tony and Jenny': '托尼和珍妮', 'Teacher (Gogo)': 'Gogo的老师', Jeeby: 'Jeeby', 'Green friend': '绿色朋友', 'Friend (reaction)': '朋友（惊叹）' };
const translations = Object.fromEntries(Object.entries(names).map(([en, zh]) => [zh, en]));
const media = [], entries = [], slugs = [];
await mkdir(output, { recursive: true });
for (const entry of scenes) {
  const slug = entry.publicSlug;
  let previous;
  try { previous = JSON.parse(await readFile(`${sceneFolder(slug, entry.cohort)}/scene.json`, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!entry.sceneId || !entry.lines?.length || !entry.lines.every(line => line.words?.length)) throw new Error(`Align the dialogue before preparing ${slug}`);
  const source = recipe.sources.find(source => source.id === entry.sourceId);
  const original = `${local}/review/${recipe.reviewFolder ?? entry.cohort}/${entry.slug}.mp4`;
  const hash = createHash('sha256').update(await readFile(original)).digest('hex').slice(0, 12);
  const video = `${slug}-review-${hash}.mp4`;
  await copyFile(original, `${local}/${video}`);
  const duration = +Number(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', original], { encoding: 'utf8' })).format.duration).toFixed(3);
  const scene = {
    version: 1, id: entry.sceneId, title: entry.titleZh, tags: entry.tags,
    description: '内部原型测试；选角色，听原声，录下自己的版本。',
    duration, video, mediaBase: `${root}${slug}/`,
    poster: `${slug}-poster-${hash}.jpg`, waveform: `waveform-${hash}.json`,
    roles: entry.roles.map(role => {
      const count = entry.lines.filter(line => line.roleId === role.id).length;
      const hint = `${count} 句台词`;
      translations[hint] = `${count} ${count === 1 ? 'line' : 'lines'}`;
      const portrait = role.portrait ?? previous?.roles.find(old => old.id === role.id)?.portrait;
      return { id: role.id, name: names[role.name] ?? role.name, label: names[role.name] ?? role.name, hint, ...(portrait ? { portrait } : {}), ...(role.selectable === false ? { selectable: false } : {}) };
    }),
    lines: entry.lines.map(line => ({ id: line.id, roleId: line.roleId, start: +(line.start - entry.start).toFixed(3), end: +(line.end - entry.start).toFixed(3), text: line.text, hint: line.hint, words: line.words.map(word => ({ ...word, start: +(word.start - entry.start).toFixed(3), end: +(word.end - entry.start).toFixed(3) })) })),
    wordTiming: entry.wordTiming, rightsStatus: recipe.rightsStatus,
    credit: { title: `${source.series} — ${source.episode}`, attribution: source.attribution, source: `${source.url}&t=${Math.floor(entry.start)}s`, licence: '未确认再分发许可', licenceUrl: 'https://www.youtube.com/howyoutubeworks/policies/copyright/', changes: `内部原型测试；原上传 ${entry.start}–${entry.end} 秒的连续节选。${entry.contentNotes ?? entry.practice}` },
  };
  await mkdir(sceneFolder(slug, entry.cohort), { recursive: true });
  await writeFile(`${sceneFolder(slug, entry.cohort)}/scene.json`, JSON.stringify(scene, null, 2) + '\n');
  translations[entry.titleZh] = entry.title;
  entries.push({ id: scene.id, slug, routeSlug: entry.routeSlug ?? existingCatalog.find(clip => clip.slug === slug)?.routeSlug ?? slug, title: entry.titleZh, english: entry.title, note: source.franchise ?? source.series, source: scene.credit.source, cohort: preschool && entry.beginnerSuitable !== true ? 'older-audience' : entry.cohort, poster: scene.mediaBase + scene.poster });
  slugs.push(slug);
  media.push({ file: `${local}/${video}`, key: `clips/${slug}/${video}` }, { file: `${local}/${scene.poster}`, key: `clips/${slug}/${scene.poster}` });
}
const catalog = existingCatalog.filter(clip => !slugs.includes(clip.slug));
await writeCatalog([...catalog, ...entries]);
await writeFile(`${output}/media.json`, JSON.stringify(media, null, 2) + '\n');
await writeFile(`${output}/translations.json`, JSON.stringify(translations, null, 2) + '\n');
execFileSync(process.execPath, ['scripts/prepare-waveforms.mjs', ...slugs], { stdio: 'inherit' });
console.log(`Prepared ${slugs.length} dialogue scenes and ${media.length} OSS media objects.`);
