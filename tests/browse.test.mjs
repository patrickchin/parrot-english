import test from 'node:test';
import assert from 'node:assert/strict';
import { browseShelves, isCollection, packSection, sectionShows, sections, shelfCount } from '../src/browse.ts';

const pack = (id, title) => ({ id, title, uploader: 'Patrick', description: '', author: '', sceneCount: 0 });
const clip = (packId, cohort, note) => ({ packId, cohort, note });
const packs = [pack('pack_memes', 'Memes'), pack('pack_shrek', 'Shrek'), pack('pack_gogo', 'Gogo'), pack('pack_friends', 'Friends'), pack('pack_empty', 'Empty')];
const clips = [
  clip('pack_memes', 'older-audience', 'Recess Therapy'), clip('pack_memes', 'older-audience', 'Steven He'),
  clip('pack_shrek', 'older-audience', 'Shrek'), clip('pack_shrek', 'older-audience', 'Shrek'),
  clip('pack_gogo', 'younger-age-5', 'Gogo'), clip('pack_gogo', 'younger-age-5', 'Gogo'), clip('pack_gogo', 'older-children', 'Gogo'),
  clip('pack_friends', 'teens', 'Friends'),
];

test('a pack with several sources is a collection; a single-source pack is a show', () => {
  assert.equal(isCollection(packs[0], clips), true);
  assert.equal(isCollection(packs[1], clips), false);
});

test('shows belong to the section of their most common audience', () => {
  assert.equal(packSection(packs[2], clips)?.id, 'first-english');
  assert.equal(packSection(packs[1], clips)?.id, 'cartoons-and-films');
  assert.deepEqual(sectionShows(sections[1], packs, clips).map(item => item.id), ['pack_shrek']);
});

test('home shelves list audience sections in learner order, then mixed collections, skipping empty ones', () => {
  const shelves = browseShelves(packs, clips);
  assert.deepEqual(shelves.map(shelf => shelf.kind === 'section' ? shelf.section.id : shelf.pack.id),
    ['first-english', 'cartoons-and-films', 'teens', 'pack_memes']);
  assert.equal(shelves[0].sceneCount, 3);
});

test('home shelves fill complete rows instead of leaving a lone wrapped card', () => {
  assert.deepEqual([1, 2, 3, 4, 13].map(items => shelfCount(items, 4)), [1, 2, 3, 4, 4]);
  assert.deepEqual([1, 2, 3, 4, 13].map(items => shelfCount(items, 3)), [1, 2, 3, 3, 3]);
  assert.deepEqual([1, 2, 3, 4, 13].map(items => shelfCount(items, 2)), [1, 2, 2, 4, 4]);
});
