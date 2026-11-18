// Real USB-debugged Android browser and microphone; no synthetic input or clock.
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const endpoint = process.env.ANDROID_CDP_URL;
if (!endpoint || !['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname)) throw Error('Set ANDROID_CDP_URL to the local adb-forwarded browser endpoint.');
if (process.platform !== 'darwin') throw Error('This acoustic test uses the macOS afplay speaker output.');
const version = await (await fetch(endpoint + '/json/version')).json();
if (!version['Android-Package']) throw Error('The endpoint must be an Android browser, not desktop emulation.');
const scene = new URL(process.env.ANDROID_TEST_SCENE ?? 'https://parrotbook.com/en/scenes/onions');
if (!/^\/en\/scenes\/[a-z0-9-]+$/.test(scene.pathname)) throw Error('Use a fresh scene URL, never an existing /dubs/ recording.');
const browser = await chromium.connectOverCDP(endpoint);
const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith(scene.origin));
if (!page) throw Error('Open Parrotbook in the connected Android browser first.');
page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(20000);
const original = page.url();
const report = { browser: version.Browser, androidPackage: version['Android-Package'], trials: [], diagnostics: [] };
page.on('console', message => { if (message.text().startsWith('Parrotbook media failure')) report.diagnostics.push(message.text()); });
const output = process.env.ANDROID_TEST_REPORT ?? resolve(tmpdir(), 'parrotbook-android-media.json');
await page.addInitScript(() => {
  window.__androidVoicePeak = 0;
  const taps = [], connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destination, ...channels) {
    if (this instanceof AudioBufferSourceNode && !this.loop && this.buffer && destination === this.context.destination) {
      const tap = this.context.createAnalyser(); tap.fftSize = 256;
      Reflect.apply(connect, this, [tap]); Reflect.apply(connect, tap, [destination]);
      taps.push(tap); return destination;
    }
    return Reflect.apply(connect, this, [destination, ...channels]);
  };
  const sample = () => {
    for (const tap of taps) {
      const values = new Float32Array(tap.fftSize); tap.getFloatTimeDomainData(values);
      window.__androidVoicePeak = Math.max(window.__androidVoicePeak, ...values.map(Math.abs));
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
});
let sound;
try {
  await page.goto(scene.href);
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  for (let trial = 0; trial < 2; trial++) {
    await page.getByRole('button', { name: /^(Record|Record this line again)$/ }).click();
    await page.getByRole('button', { name: 'Stop recording', exact: true }).waitFor({ timeout: 15000 });
    // Play an authored source performance through the computer's speaker into
    // the nearby phone's real microphone. Keep both devices' speakers audible.
    sound = spawn('afplay', ['-v', '0.7', resolve('content/media/sintel/search-v1.mp4')]);
    const listen = page.getByRole('button', { name: 'My recording', exact: true });
    await expect(listen).toBeEnabled({ timeout: 20000 });
    sound.kill(); sound = undefined;
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
    await page.reload();
    await expect(listen).toBeEnabled({ timeout: 15000 });
    for (let replay = 0; replay < 2; replay++) {
      await page.evaluate(() => { window.__androidVoicePeak = 0; });
      await listen.click();
      await page.getByRole('button', { name: 'Stop playback', exact: true }).waitFor({ timeout: 15000 });
      await page.waitForFunction(() => window.__androidVoicePeak > 0.003, undefined, { timeout: 10000 });
      await expect(listen).toBeEnabled({ timeout: 20000 });
      await expect(page.getByRole('alert')).toHaveCount(0);
      report.trials.push({ trial, replay, time: await page.locator('video').evaluate(video => video.currentTime), peak: await page.evaluate(() => window.__androidVoicePeak) });
    }
  }
  await page.goto(original);
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  sound?.kill();
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: !report.error, replays: report.trials.length, report: output, error: report.error }));
  // End this CDP client without sending Browser.close to the user's phone.
  process.exit(process.exitCode ?? 0);
}
