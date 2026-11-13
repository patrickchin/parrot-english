import test from 'node:test';
import assert from 'node:assert/strict';
import { franchiseGroup } from '../src/franchises.ts';

test('new internet meme sources join Memes while film collections keep their names', () => {
  assert.equal(franchiseGroup({ note: 'A newly discovered creator', tags: ['internet', 'meme'] }), 'Memes');
  assert.equal(franchiseGroup({ note: 'SpongeBob SquarePants', tags: ['meme', 'comedy'] }), 'SpongeBob SquarePants');
  assert.equal(franchiseGroup({ note: 'Friends', tags: ['conversation'] }), 'Friends');
});
