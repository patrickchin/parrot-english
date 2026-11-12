import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clips, packs, sceneFile } from '../content-fixtures.ts';

test('every catalogued scene and role has localized content using its record ID', () => {
  for (const clip of clips) {
    const scene = JSON.parse(readFileSync(sceneFile(clip.slug)));
    assert.equal(clip.id, scene.id);
    const pack = packs.find(pack => pack.entry.id === clip.packId).data;
    for (const language of ['en', 'zh-CN', 'es', 'ja', 'ko']) {
      const content = pack.locales[language];
      for (const field of ['title', 'licence', 'changes']) assert.equal(typeof content.scenes[scene.id][field], 'string');
      for (const role of scene.roles) {
        for (const field of ['name', 'hint']) assert.equal(typeof content.roles[role.id][field], 'string');
      }
    }
  }
});
