import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { existsSync } from 'node:fs';

// Browser-flow tests use local authoring fixtures for the OSS media origin.
// Actual OSS headers, hashes, and playback are verified after provisioning.
export const test = base.extend<{ samplePack: boolean }>({
  samplePack: [false, { option: true }],
  page: async ({ page, samplePack }, use) => {
    // Licensed internal fixture exercises multi-line capture without publishing it in the app.
    if (samplePack) await page.route('**/packs/patrick/*.json', async route => {
      const file = new URL(route.request().url()).pathname.split('/').pop();
      await route.fulfill({ body: await readFile(`tests/fixtures/sintel/${file}`), contentType: 'application/json' });
    });
    if (!process.env.PARROTBOOK_LIVE_MEDIA) await page.route('https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/clips/**', async route => {
      const match = /^\/clips\/([a-z0-9-]+)\/([a-zA-Z0-9_-]+\.(mp4|m4a|jpg))$/.exec(new URL(route.request().url()).pathname);
      if (!match) return route.abort();
      const folder = match[1] === 'sintel' ? 'content/media/sintel' : 'content/local-dubbing';
      if (!existsSync(`${folder}/${match[2]}`)) return route.continue();
      const types: Record<string, string> = { '.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.jpg': 'image/jpeg' };
      const body = await readFile(`${folder}/${match[2]}`);
      const headers = { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes' };
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
      if (range) {
        const start = Number(range[1]), end = Math.min(Number(range[2] || body.length - 1), body.length - 1);
        await route.fulfill({ status: 206, body: body.subarray(start, end + 1), contentType: types[extname(match[2])], headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${body.length}` } });
      } else await route.fulfill({ body, contentType: types[extname(match[2])], headers });
    });
    await use(page);
  },
});
export { expect };
