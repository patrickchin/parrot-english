import { clips, sceneFile } from '../content-fixtures.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { searchScenes } from '../../src/scene-search.ts';

const load = async path => JSON.parse(await readFile(path, 'utf8'));
const catalog = clips;
const scenes = clips;

test('shipped scene tags and all dialogue stay in sync with the search index and authoring recipes', async () => {
  const recipes = await Promise.all(['meme', 'preschool', 'tv', 'franchise'].map(name => load(`content/${name}-review-scenes.json`)));
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
