import { readFile, writeFile } from 'node:fs/promises';
import { validateScene } from '../src/scene.ts';

// Index only searchable text, keeping timed words and media out of the library bundle.
const catalog = JSON.parse(await readFile('src/review-clips.json', 'utf8'));
const index = {};
for (const entry of catalog) {
  const scene = validateScene(JSON.parse(await readFile(`public/scenes/${entry.slug}/scene.json`, 'utf8')), `/scenes/${entry.slug}/`);
  index[entry.slug] = { tags: scene.tags ?? [], quotes: scene.lines.flatMap(line => [line.text, line.hint]) };
}
const path = 'src/scene-search-index.json';
const output = JSON.stringify(index, null, 2) + '\n';
const previous = await readFile(path, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; });
if (previous !== output) await writeFile(path, output);
