import { test, expect } from './fixtures';
import { prepareMediaTest, type MediaAudit } from './media-fixture';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test.use({ sampleScene: true });
for (const fault of ['pause', 'rate', 'audio-suspend', 'drift'] as const) test(`recorded replay diagnostics identify ${fault} before cleanup`, async ({ page }) => {
  await prepareMediaTest(page);
  const logs: string[] = [];
  page.on('console', message => { if (message.type() === 'warning') logs.push(message.text()); });
  await page.goto('/en/scenes/patrick');
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  const listen = page.getByRole('button', { name: 'My recording', exact: true });
  await expect(listen).toBeEnabled();
  await listen.click();
  await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
  await page.evaluate(async fault => {
    const video = document.querySelector('video')!;
    const context = (window as unknown as { mediaAudit: MediaAudit }).mediaAudit.context!;
    if (fault === 'pause') video.pause();
    if (fault === 'rate') video.playbackRate = 1.5;
    if (fault === 'audio-suspend') await context.suspend();
    if (fault === 'drift') context.getOutputTimestamp = () => ({ contextTime: Math.max(0, context.currentTime - 0.5), performanceTime: performance.now() });
  }, fault);
  await expect(page.getByRole('alert')).toContainText('Playback or recording was interrupted');
  await page.getByText('Error details', { exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Diagnostic report', exact: true });
  const report = JSON.parse(await field.inputValue());
  const reason = { pause: 'video-paused', rate: 'video-rate', 'audio-suspend': 'audio-state', drift: 'replay-drift' }[fault];
  expect(report.revision).toMatch(/^[a-f0-9]{40}$/);
  expect(report.phase).toBe('listening');
  expect(report.events.length).toBeLessThanOrEqual(24);
  const last = report.events.at(-1);
  expect(last.event).toBe(reason);
  expect(last.video.paused).toBe(fault === 'pause');
  if (fault === 'rate') expect(last.video.rate).toBe(1.5);
  if (fault === 'audio-suspend') expect(last.audio.state).toBe('suspended');
  if (fault === 'drift') expect(Math.abs(last.details.drift)).toBeGreaterThan(0.12);
  expect(logs.some(log => log.includes('Parrotbook media failure') && log.includes(reason))).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (value: string) => {
      (window as unknown as { copiedReport: string }).copiedReport = value;
    } } });
  });
  await page.getByRole('button', { name: 'Copy diagnostic report', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Report copied', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { copiedReport: string }).copiedReport)).toBe(await field.inputValue());
  if (fault === 'pause') {
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard denied'); }; });
    await page.getByRole('button', { name: 'Report copied', exact: true }).click();
    await expect(field).toBeFocused();
    expect(await field.evaluate(node => { const input = node as HTMLTextAreaElement; return input.selectionEnd - input.selectionStart; })).toBe((await field.inputValue()).length);
    const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
    await mkdir(folder, { recursive: true });
    await page.screenshot({ path: join(folder, `media-diagnostics-${test.info().project.name}.png`), fullPage: true });
  }
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  await expect(listen).toBeEnabled();
});
