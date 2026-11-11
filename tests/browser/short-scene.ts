import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

let clip: Buffer | undefined;
// A matching short source keeps draft/export tests fast without lying about the
// manifest's duration. FFmpeg only prepares this internal test fixture.
export async function routeShortScene(page: Page) {
  if (!clip) {
    const folder = mkdtempSync(join(tmpdir(), 'parrotbook-test-'));
    try {
      const path = join(folder, 'scene.mp4');
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', 'content/media/sintel/search-v1.mp4', '-t', '3.2', '-c', 'copy', '-movflags', '+faststart', path]);
      clip = readFileSync(path);
    } finally { rmSync(folder, { recursive: true, force: true }); }
  }
  const body = clip;
  await page.route('**/search-v1.mp4', route => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
    const headers = { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes' };
    if (!range) return route.fulfill({ body, contentType: 'video/mp4', headers });
    const start = Number(range[1]), end = Math.min(Number(range[2] || body.length - 1), body.length - 1);
    return route.fulfill({ status: 206, body: body.subarray(start, end + 1), contentType: 'video/mp4', headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${body.length}` } });
  });
}
