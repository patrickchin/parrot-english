import test from 'node:test';
import assert from 'node:assert/strict';
import { searchScenes } from '../src/scene-search.ts';

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
