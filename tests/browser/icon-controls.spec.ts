import { test, expect } from './fixtures';
import type { Locator } from '@playwright/test';
import { prepareMediaTest } from './media-fixture';
import { mobileScreenshot, touchControl } from './mobile-viewports';

test.use({ sampleScene: true });

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

async function expectCaption(control: Locator, text: string, inline: boolean) {
  const caption = control.getByText(text, { exact: true });
  if (!inline) {
    await expect(caption).toBeHidden();
    return;
  }
  await expect(caption).toBeVisible();
  const icon = (await control.locator('svg').first().boundingBox())!;
  const label = (await caption.boundingBox())!;
  expect(label.x).toBeGreaterThanOrEqual(icon.x + icon.width);
  expect(Math.abs(label.y + label.height / 2 - icon.y - icon.height / 2)).toBeLessThan(1);
}

test('icon-first practice controls stay named, readable and usable across phone and desktop layouts', async ({ page }, info) => {
  await prepareMediaTest(page);
  await page.goto('/en/scenes/patrick');
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  const original = page.getByRole('button', { name: 'Listen to the original line', exact: true });
  const record = page.getByRole('button', { name: 'Record', exact: true });
  const take = page.getByRole('button', { name: 'My recording (You)', exact: true });
  await expect(take).toBeDisabled();
  const controls = page.getByRole('group', { name: 'Dubbing controls', exact: true });
  const names = ['Listen to the original line', 'Record', 'My recording (You)', 'Previous line', 'Next', 'Start over', 'Scene credits'];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of names) {
      const control = page.getByRole('button', { name, exact: true });
      await touchControl(page, control);
      await expect(control.locator('svg').first()).toBeVisible();
      expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight), `${name} content fits at ${viewport.width}px`).toBe(true);
    }
    const inline = (await controls.boundingBox())!.width >= 340;
    for (const [control, caption] of [
      [original, 'Original'], [record, 'Record'], [take, 'You'],
      [page.getByRole('button', { name: 'Previous line', exact: true }), 'Previous'],
      [page.getByRole('button', { name: 'Next', exact: true }), 'Next'],
    ] as const) await expectCaption(control, caption, inline);
    if (info.project.name === 'chromium') {
      await page.evaluate(() => scrollTo(0, 0));
      await mobileScreenshot(page, info, 'icon-practice', String(viewport.width));
    }
  }

  await page.keyboard.press('Tab');
  const credits = page.getByRole('button', { name: 'Scene credits', exact: true });
  await credits.focus();
  await expect(credits).toBeFocused();
  await expect(page.getByText('Scene credits', { exact: true })).toBeVisible();
  await credits.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Scene credits', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Dialogue', exact: true }).getByText("I'm searching for someone.", { exact: true })).toBeVisible();
  const reset = page.getByRole('button', { name: 'Start over', exact: true });
  await page.getByRole('button', { name: 'Previous line', exact: true }).press('Tab');
  await expect(reset).toBeFocused();
  await expect(page.getByText('Start over', { exact: true })).toBeVisible();
  await reset.press('Enter');
  await expect(dialog.getByRole('heading', { name: 'Start a new session?', exact: true })).toBeVisible();
  await expect(dialog.getByText('This attempt stays in My dubs. You can continue it at any time.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep recordings and continue', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Dialogue', exact: true }).getByText("I'm searching for someone.", { exact: true })).toBeVisible();
});

test('compact recording and result actions retain their full names and accepted take', async ({ page }, info) => {
  const lines = await prepareMediaTest(page);
  await page.goto('/en/scenes/patrick');
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  const controls = page.getByRole('group', { name: 'Dubbing controls', exact: true });
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  const stopRecording = page.getByRole('button', { name: 'Stop recording', exact: true });
  await expect(stopRecording).toBeVisible();
  await expectCaption(stopRecording, 'Stop', (await controls.boundingBox())!.width >= 340);
  await expect(stopRecording.locator('svg').first()).toBeVisible();
  const take = page.getByRole('button', { name: 'My recording (You)', exact: true });
  await expect(take).toBeEnabled();
  await expectCaption(take, 'You', (await controls.boundingBox())!.width >= 340);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeAttached();
  await take.click();
  const stopPlayback = page.getByRole('button', { name: 'Stop playback', exact: true });
  await expectCaption(stopPlayback, 'Stop', (await controls.boundingBox())!.width >= 340);
  await expect(stopPlayback.locator('svg').first()).toBeVisible();
  await stopPlayback.click();
  await expect(take).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Record this line again', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  for (const _ of lines) await page.getByRole('button', { name: 'Next', exact: true }).click();
  const result = page.getByRole('region', { name: 'Dub complete', exact: true });
  await expect(result.getByRole('heading', { name: 'Your dub is ready!', exact: true })).toBeAttached();
  await expect(result.getByText('Recorded lines: 1.', { exact: true })).toBeAttached();
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ['Previous line', 'Play my dub', 'Edit a line', 'Download video', 'Prepare to share', 'Start over', 'Scene credits']) {
      const control = result.getByRole('button', { name, exact: true });
      await touchControl(page, control);
      await expect(control.locator('svg').first()).toBeVisible();
      expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight), `${name} content fits at ${viewport.width}px`).toBe(true);
    }
    const inline = (await controls.boundingBox())!.width >= 340;
    for (const [name, caption] of [
      ['Previous line', 'Previous'], ['Play my dub', 'Play'], ['Edit a line', 'Edit'],
      ['Download video', 'Download'],
    ]) await expectCaption(result.getByRole('button', { name, exact: true }), caption, inline);
    if (info.project.name === 'chromium' && [390, 1440].includes(viewport.width)) {
      await page.evaluate(() => scrollTo(0, 0));
      await mobileScreenshot(page, info, 'icon-result', String(viewport.width));
    }
  }
});

test('translated icon controls and inline captions fit small phones in all five languages', async ({ page }) => {
  const lines = await prepareMediaTest(page);
  await page.setViewportSize({ width: 320, height: 568 });
  const languages = [
    { path: 'en', start: 'Start dubbing', record: 'Record', next: 'Next' },
    { path: 'zh', start: '开始配音', record: '开始录音', next: '下一步' },
    { path: 'es', start: 'Empezar a doblar', record: 'Grabar', next: 'Siguiente' },
    { path: 'ja', start: '吹き替えを始める', record: '録音', next: '次へ' },
    { path: 'ko', start: '더빙 시작', record: '녹음', next: '다음' },
  ];
  for (const language of languages) {
    await page.goto(`/${language.path}/scenes/patrick`);
    await page.getByRole('button', { name: language.start, exact: true }).click();
    await expect(page.getByRole('button', { name: language.record, exact: true })).toBeVisible();
    for (const state of ['practice', 'result']) {
      if (state === 'result') for (const _ of lines) await page.getByRole('button', { name: language.next, exact: true }).click();
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 568 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${language.path} ${state} has no horizontal overflow`).toBe(true);
        for (const control of await page.getByRole('button').all()) {
          const caption = (await control.innerText()).trim();
          const name = await control.getAttribute('aria-label');
          await expect(control).toHaveAccessibleName(/.+/);
          if (caption && name) expect(name.toLocaleLowerCase(), `${language.path} ${state}: ${caption} remains in the action name`).toContain(caption.toLocaleLowerCase());
          await touchControl(page, control);
          expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight), `${language.path} ${state}: ${caption || name} fits`).toBe(true);
        }
      }
    }
  }
});
