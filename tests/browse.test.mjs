import test from 'node:test';
import assert from 'node:assert/strict';
import { browseShelves, hasTag, isBrowseTag, isCollection, sceneLevel, sceneTopics, shelfCount } from '../src/browse.ts';

const pack = (id, title) => ({ id, title, uploader: 'Patrick', description: '', author: '', sceneCount: 0 });
const clip = (packId, note, quotes = ['Hello there.'], tags = []) => ({ packId, note, quotes, tags });
const packs = [pack('pack_memes', 'Memes'), pack('pack_shrek', 'Shrek'), pack('pack_empty', 'Empty')];
const clips = [clip('pack_memes', 'Recess Therapy'), clip('pack_memes', 'Steven He'), clip('pack_shrek', 'Shrek'), clip('pack_shrek', 'Shrek')];

test('a pack with several sources is a collection; a single-source pack is a show', () => {
  assert.equal(isCollection(packs[0], clips), true);
  assert.equal(isCollection(packs[1], clips), false);
});

test('home lists shows first, then each collection, skipping empty packs', () => {
  const shelves = browseShelves(packs, clips);
  assert.deepEqual(shelves.map(shelf => shelf.kind === 'shows' ? shelf.shows.map(show => show.id) : shelf.pack.id), [['pack_shrek'], 'pack_memes']);
});

test('the estimated level follows average words per spoken line', () => {
  assert.equal(sceneLevel({ quotes: ['Hello!', 'Good morning.'] }), 'starter');
  assert.equal(sceneLevel({ quotes: ['I like this one.', 'Where is my hat?'] }), 'beginner');
  assert.equal(sceneLevel({ quotes: ['I think we should probably leave before it gets dark.'] }), 'intermediate');
});

test('topics map from authored keywords, any number per scene', () => {
  assert.deepEqual(sceneTopics({ tags: ['Peppa', 'Food', 'family', 'pancakes'] }), ['food', 'family']);
  assert.deepEqual(sceneTopics({ tags: ['Sheldon'] }), []);
  assert.equal(hasTag({ tags: ['magic'], quotes: ['Hi.'] }, 'starter'), true);
  assert.equal(hasTag({ tags: ['magic'], quotes: ['Hi.'] }, 'magic'), true);
  assert.equal(isBrowseTag('teens'), false);
});

test('home shelves fill complete rows instead of leaving a lone wrapped card', () => {
  assert.deepEqual([1, 2, 3, 4, 13].map(items => shelfCount(items, 4)), [1, 2, 3, 4, 4]);
  assert.deepEqual([1, 2, 3, 4, 13].map(items => shelfCount(items, 3)), [1, 2, 3, 3, 3]);
  assert.deepEqual([1, 2, 3, 4, 13].map(items => shelfCount(items, 2)), [1, 2, 2, 4, 4]);
});
