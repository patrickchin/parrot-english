import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('short social exchanges and solo performances produce captions while film safeguards remain enforced', async t => {
  const root = await mkdtemp(join(tmpdir(), 'parrotbook-short-meme-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'content'));
  await mkdir(join(root, 'bin'));
  // This checks authoring validation and captions; real media decoding is a separate check.
  await writeFile(join(root, 'bin/ffprobe'), '#!/usr/bin/env node\nconsole.log(JSON.stringify({format:{duration:4.4},streams:[{codec_type:"audio"},{codec_type:"video"}]}));\n', { mode: 0o700 });
  const recipe = {
    rightsStatus: 'redistribution-not-cleared',
    sources: [{ id: 'source', url: 'https://www.instagram.com/reel/source/', attribution: 'Test source' }],
    scenes: [{ slug: 'short-exchange', sourceId: 'source', title: 'News and reaction', start: 0, end: 4.4,
      roles: [{ id: 'role_a', name: 'Woman' }, { id: 'role_b', name: 'Matt' }],
      lines: [
        { roleId: 'role_a', speaker: 'Woman', start: 0.4, end: 2, text: 'They were roommates!', hint: '室友！' },
        { roleId: 'role_b', speaker: 'Matt', start: 2.2, end: 4.2, text: 'They were roommates.', hint: '原来是室友。' },
      ] }],
  };
  const script = resolve('scripts/prepare-review-clips.mjs');
  const run = cohort => spawnSync(process.execPath, [script, cohort, '--captions-only'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, PATH: join(root, 'bin') + ':' + process.env.PATH },
  });
  await writeFile(join(root, 'content/social-meme-review-scenes.json'), JSON.stringify(recipe));
  const social = run('social-memes');
  assert.equal(social.status, 0, social.stderr);
  const captions = await readFile(join(root, 'content/local-dubbing/review/social-memes/short-exchange.vtt'), 'utf8');
  assert.equal(captions.split(' --> ').length - 1, 2);
  assert.match(captions, /室友！/);
  const notes = await readFile(join(root, 'content/local-dubbing/review/social-memes/short-exchange.txt'), 'utf8');
  assert.ok(notes.includes('Source: https://www.instagram.com/reel/source/\n'));
  await writeFile(join(root, 'content/meme-review-scenes.json'), JSON.stringify(recipe));
  assert.match(run('older-audience').stderr, /Needs a complete character exchange/);
  recipe.scenes[0].lines[1].roleId = 'role_a';
  recipe.scenes[0].lines[1].speaker = 'Woman';
  await writeFile(join(root, 'content/social-meme-review-scenes.json'), JSON.stringify(recipe));
  recipe.scenes[0].roles = recipe.scenes[0].roles.slice(0, 1);
  await writeFile(join(root, 'content/social-meme-review-scenes.json'), JSON.stringify(recipe));
  const solo = run('social-memes');
  assert.equal(solo.status, 0, solo.stderr);
  recipe.scenes[0].lines = recipe.scenes[0].lines.slice(0, 1);
  await writeFile(join(root, 'content/social-meme-review-scenes.json'), JSON.stringify(recipe));
  recipe.scenes[0].end = 2.8;
  await writeFile(join(root, 'content/social-meme-review-scenes.json'), JSON.stringify(recipe));
  await writeFile(join(root, 'bin/ffprobe'), '#!/usr/bin/env node\nconsole.log(JSON.stringify({format:{duration:2.8},streams:[{codec_type:"audio"},{codec_type:"video"}]}));\n', { mode: 0o700 });
  const oneLine = run('social-memes');
  assert.equal(oneLine.status, 0, oneLine.stderr);
  recipe.scenes[0].lines = [];
  await writeFile(join(root, 'content/social-meme-review-scenes.json'), JSON.stringify(recipe));
  assert.match(run('social-memes').stderr, /Invalid timings/);
});
