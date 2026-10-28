import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { existsSync } from 'node:fs';

// Browser-flow tests use local authoring fixtures for the OSS media origin.
// Actual OSS headers, hashes, and playback are verified after provisioning.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/clips/**', async route => {
      const match = /^\/clips\/(patrick|chocolate|wumbo|onions|sintel)\/([a-zA-Z0-9_-]+\.(mp4|m4a|jpg))$/.exec(new URL(route.request().url()).pathname);
      if (!match) return route.abort();
      const folder = match[1] === 'sintel' ? 'content/media/sintel' : 'content/local-dubbing';
      if (!existsSync(`${folder}/${match[2]}`)) return route.continue();
      const types: Record<string, string> = { '.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.jpg': 'image/jpeg' };
      await route.fulfill({ body: await readFile(`${folder}/${match[2]}`), contentType: types[extname(match[2])], headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await use(page);
  },
});
export { expect };
