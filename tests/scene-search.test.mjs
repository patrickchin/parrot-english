import { clips, sceneFile } from './content-fixtures.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { searchScenes } from '../src/scene-search.ts';

const load = async path => JSON.parse(await readFile(path, 'utf8'));
const catalog = clips;
const scenes = clips;

test('Fuse ranks metadata above dialogue and handles typos, combined terms and punctuation', () => {
  const scene = (slug, tags = [], quotes = []) => ({ slug, title: '', english: '', note: '', tags, quotes });
  const quote = scene('quote', [], ['Heineken! Heineken! Heineken!']);
  const tag = scene('tag', ['Heineken']);
  const title = { ...scene('title'), title: 'Heineken advert' };
  const translated = scene('translated');
  const all = [quote, tag, title, translated];
  for (const query of ['  HEINEKEN! ', 'Heinekn']) {
    const results = searchScenes(all, query);
    assert.deepEqual(new Set(results.slice(0, 2)), new Set([tag, title]));
    assert.equal(results.at(-1), quote);
  }
  assert.deepEqual(searchScenes(all, '啤酒', s => s === translated ? '啤酒广告' : s.title), [translated]);
  assert.deepEqual(searchScenes(all, 'unknown'), []);
  assert.deepEqual(searchScenes(all, '  '), all);
  assert.deepEqual(searchScenes(all, '?!'), all);
  assert.deepEqual(all, [quote, tag, title, translated], 'search must not reorder the source catalog');
  const combined = scene('combined', ['SpongeBob', 'Patrick'], ["I'm ready, Squidward!", '我准备好了！']);
  for (const query of ['spongebob patrick', 'spongebb patrik', 'spongebob i’m READY', 'im ready', '我准备好了']) {
    assert.deepEqual(searchScenes([combined], query), [combined]);
  }
  assert.deepEqual(searchScenes([combined], 'spongebob nonexistent'), []);
  assert.deepEqual(searchScenes([combined], 'spongebb unknownword'), []);
});

test('shipped scene tags and all dialogue stay in sync with the search index and authoring recipes', async () => {
  const recipes = await Promise.all(['meme', 'preschool', 'tv'].map(name => load(`content/${name}-review-scenes.json`)));
  const authored = recipes.flatMap(recipe => recipe.scenes);
  assert.equal(new Set(catalog.map(scene => scene.slug)).size, catalog.length);
  for (const entry of scenes) {
    const scene = await load(sceneFile(entry.slug));
    assert.ok(scene.tags.length > 0, entry.slug);
    assert.deepEqual({ tags: entry.tags, quotes: entry.quotes }, { tags: scene.tags, quotes: scene.lines.flatMap(line => [line.text, line.hint]) });
    const recipe = authored.find(scene => (scene.publicSlug ?? scene.slug) === entry.slug);
    assert.deepEqual(recipe.tags, scene.tags, entry.slug);
  }
  const spongeBob = ['patrick', 'chocolate', 'wumbo', 'im-ready', 'mayonnaise'];
  for (const query of ['SpongeBob', 'sponge bob', '海绵宝宝']) {
    assert.deepEqual(searchScenes(scenes, query).map(s => s.slug), spongeBob);
  }
  assert.deepEqual(searchScenes(scenes, 'Spongebb').map(s => s.slug), spongeBob);
  assert.deepEqual(searchScenes(scenes, 'Heineken'), [], 'do not tag unrelated content');
  assert.deepEqual(searchScenes(scenes, 'Krusty Krab').map(s => s.slug), ['patrick']);
  assert.deepEqual(searchScenes(scenes, 'Horseradish').map(s => s.slug), ['mayonnaise']);
  assert.deepEqual(searchScenes(scenes, 'horseradsh').map(s => s.slug), ['mayonnaise']);
  assert.deepEqual(searchScenes(scenes, '辣根').map(s => s.slug), ['mayonnaise']);
  assert.equal(searchScenes(scenes, 'instruments')[0].slug, 'mayonnaise', 'tag matches precede quoted mentions');
});
