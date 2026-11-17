import type { Locator, Page } from '@playwright/test';
import en from '../../src/locales/en/translation.json' with { type: 'json' };
import zh from '../../src/locales/zh-CN/translation.json' with { type: 'json' };
import { readScene } from '../content-fixtures';
import { test, expect } from './fixtures';
import { scenePath } from './scene-path';
import { mobileScreenshot } from './mobile-viewports';
import { expectPictureSubtitles } from './picture-subtitles';

const phones = [
  { width: 375, height: 667 },
  { width: 390, height: 664 },
  { width: 390, height: 844 },
];

async function fullyVisible(control: Locator, page: Page, minimumHeight = 0) {
  await expect(control).toBeVisible();
  const box = (await control.boundingBox())!;
  const viewport = page.viewportSize()!;
  const label = await control.getAttribute('aria-label') || await control.innerText();
  expect(box.x, label).toBeGreaterThanOrEqual(-1);
  expect(box.y, label).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, label).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height, label).toBeLessThanOrEqual(viewport.height + 1);
  expect(box.height, `${label} touch target`).toBeGreaterThanOrEqual(minimumHeight);
  // WebKit can round a fractional clipping edge by less than one CSS pixel.
  // Use the same one-pixel tolerance as the viewport bounds above.
  await expect(control).toBeInViewport({ ratio: 1 - 1 / Math.min(box.width, box.height) });
}

async function noHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    viewport: innerWidth,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
}

for (const [language, translations] of [['en', en], ['zh-CN', zh]] as const) {
  for (const slug of ['onions', 'wumbo']) {
    test(`${language} ${slug}: phone picture and all lesson options fit together`, async ({ page }, info) => {
      const ui = translations.player;
      const scene = readScene(slug);
      const roles = scene.roles.filter((role: { selectable?: boolean }) => role.selectable !== false);
      const lines = scene.lines.filter((line: { roleId: string }) => line.roleId === roles[0].id);
      await page.setViewportSize(phones[0]);
      await page.goto(scenePath(slug, undefined, language));
      const movie = page.getByRole('region', { name: ui.movieScene, exact: true });
      const picture = movie.getByLabel(/dialogue scene$|对话片段$/);
      await expect.poll(() => picture.evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
      const native = await picture.evaluate((video: HTMLVideoElement) => ({ width: video.videoWidth, height: video.videoHeight }));
      console.info(`${language} ${slug} native picture: ${native.width} × ${native.height}`);

      const check = async (step: string, required: Locator[], captionLine?: { text: string; hint?: string }) => {
        for (const viewport of phones) {
          await page.setViewportSize(viewport);
          // Check before any action can scroll an off-screen button into view.
          await expect(async () => {
            const bounds = (await picture.boundingBox())!;
            const context = `${language} ${slug} ${step} ${viewport.width}×${viewport.height}; native ${native.width}×${native.height}; picture ${JSON.stringify(bounds)}`;
            const viewingArea = (await movie.getByRole('button', { name: step === 'result' ? ui.playMyDub : ui.playOriginalScene, exact: true }).boundingBox())!;
            const banner = page.getByRole('banner');
            const header = (await banner.boundingBox())!;
            const movieBounds = (await movie.boundingBox())!;
            const workspace = page.getByRole('region', { name: step === 'choose' ? ui.chooseARole : step === 'result' ? ui.dubComplete : ui.recordYourLines, exact: true });
            const workspaceBounds = (await workspace.boundingBox())!;
            const movieEnd = step === 'choose' ? movieBounds.y + movieBounds.height
              : await movie.getByRole('progressbar', { name: ui.scenePlaybackProgress, exact: true }).evaluate(el => el.parentElement!.getBoundingClientRect().bottom);
            expect(Math.abs(viewingArea.x), context).toBeLessThan(1);
            expect(Math.abs(viewingArea.width - viewport.width), context).toBeLessThan(1);
            expect(viewingArea.y - header.y - header.height, `${context}; header-to-video gap`).toBeGreaterThanOrEqual(-1);
            expect(viewingArea.y - header.y - header.height, `${context}; header-to-video gap`).toBeLessThanOrEqual(8);
            expect(workspaceBounds.y - movieEnd, `${context}; video-to-workspace gap`).toBeGreaterThanOrEqual(-1);
            expect(workspaceBounds.y - movieEnd, `${context}; video-to-workspace gap`).toBeLessThanOrEqual(8);
            expect(Math.abs(bounds.width - viewport.width), context).toBeLessThan(1);
            expect(Math.abs(bounds.width - bounds.height * native.width / native.height), context).toBeLessThan(1);
            expect(Math.abs(bounds.y - viewingArea.y), `${context}; no spare space inside the viewing area`).toBeLessThan(1);
            expect(Math.abs(bounds.height - viewingArea.height), context).toBeLessThan(1);
            await fullyVisible(picture, page);
            for (const control of required) await fullyVisible(control, page, 44);
            // Include transport, line selection, role choice, and sharing actions.
            for (const control of await page.getByRole('main').getByRole('button').all()) await fullyVisible(control, page, 44);
            for (const control of await banner.getByRole('button').all()) await fullyVisible(control, page);
            await fullyVisible(banner.getByRole('combobox'), page);
            await expect(page.getByText(ui.chooseALine, { exact: true })).toHaveCount(0);
            if (captionLine) {
              const caption = movie.getByRole('group', { name: ui.dialogue, exact: true });
              await fullyVisible(caption.getByText(captionLine.text, { exact: true }), page);
              if (captionLine.hint) await fullyVisible(caption.getByText(captionLine.hint, { exact: true }), page);
            }
            await expectPictureSubtitles(page, ui.movieScene, ui.dialogue);
            if (step.startsWith('practice')) {
              const guidance = workspace.getByRole('status').filter({ hasText: translations.recording.listenFirst });
              await expect(guidance).toHaveText(translations.recording.listenFirst);
              for (const name of [ui.listenToTheOriginalLine, ui.record, ui.myRecording]) {
                await fullyVisible(workspace.getByRole('button', { name, exact: true }), page, 56);
              }
            }
            await noHorizontalOverflow(page);
            const documentSize = await page.evaluate(() => ({
              height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
              viewport: innerHeight, scroll: scrollY,
            }));
            expect(documentSize.height, context).toBeLessThanOrEqual(documentSize.viewport + 1);
            expect(documentSize.scroll, context).toBeLessThanOrEqual(1);
          }).toPass({ timeout: 3000 });
          if (info.project.name === 'chromium' && language === 'en' && slug === 'wumbo' && viewport.width === 375 && ['choose', 'practice line 1', 'result'].includes(step)) {
            await mobileScreenshot(page, info, `compact-${step.replaceAll(' ', '-')}`, 'phone-375');
          }
        }
      };

      const choose = page.getByRole('region', { name: ui.chooseARole, exact: true });
      await expect(choose.getByRole('button')).toHaveCount(roles.length + 2);
      await check('choose', [choose.getByRole('button', { name: ui.startDubbing, exact: true }), page.getByRole('button', { name: ui.sceneCredits, exact: true })], scene.lines[0]);
      await choose.getByRole('button', { name: ui.startDubbing, exact: true }).click();
      const practice = page.getByRole('region', { name: ui.recordYourLines, exact: true });
      for (const [index, line] of lines.entries()) {
        await expect(movie.getByRole('group', { name: ui.dialogue, exact: true }).getByText(line.text, { exact: true })).toBeVisible();
        await check(`practice line ${index + 1}`, [
          ...[ui.listenToTheOriginalLine, ui.record, ui.myRecording, ui.previousLine, ui.next, ui.startOver, ui.sceneCredits]
            .map(name => practice.getByRole('button', { name, exact: true })),
        ], line);
        await practice.getByRole('button', { name: ui.next, exact: true }).click();
      }
      const result = page.getByRole('region', { name: ui.dubComplete, exact: true });
      await check('result', [
        ...[ui.playMyDub, ui.editALine, translations.download.downloadVideo, translations.share.prepare, ui.startOver, ui.sceneCredits]
          .map(name => result.getByRole('button', { name, exact: true })),
      ], scene.lines[0]);
    });
  }
}

test('a small phone can scroll to every lesson action without horizontal clipping', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(scenePath('wumbo', undefined, 'en'));
  const picture = page.getByRole('region', { name: en.player.movieScene, exact: true }).getByLabel(/dialogue scene$/);
  await expect.poll(() => picture.evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
  const visitActions = async () => {
    for (const action of await page.getByRole('main').getByRole('button').all()) {
      // Scroll the page without focusing an off-screen action into view.
      for (let attempt = 0; attempt < 12; attempt++) {
        const box = (await action.boundingBox())!;
        if (box.y >= 0 && box.y + box.height <= 568) break;
        await page.evaluate(amount => window.scrollBy(0, amount), box.y < 0 ? -240 : 240);
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      }
      await fullyVisible(action, page, 44);
    }
    await noHorizontalOverflow(page);
  };
  await visitActions();
  await page.getByRole('button', { name: en.player.startDubbing, exact: true }).click();
  const scene = readScene('wumbo');
  for (const _ of scene.lines.filter((line: { roleId: string }) => line.roleId === scene.roles[0].id)) {
    await visitActions();
    await page.getByRole('button', { name: en.player.next, exact: true }).click();
  }
  await expect(page.getByRole('region', { name: en.player.dubComplete, exact: true })).toBeVisible();
  await visitActions();
});

test('four role choices keep their portraits, names and actions inside a short phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(scenePath('first-english-nice-to-meet-you', undefined, 'en'));
  const choose = page.getByRole('region', { name: en.player.chooseARole, exact: true });
  await expect(choose.getByRole('button')).toHaveCount(6);
  const roles: Locator[] = [];
  for (const button of await choose.getByRole('button').all()) {
    if (await button.getAttribute('aria-pressed') !== null) roles.push(button);
  }
  expect(roles).toHaveLength(4);
  for (const role of roles) {
    await fullyVisible(role, page, 44);
    expect(await role.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(element);
      return [...range.getClientRects()].every(rect => rect.left >= bounds.left && rect.right <= bounds.right && rect.top >= bounds.top && rect.bottom <= bounds.bottom);
    }), 'Each role name and portrait stays inside its own button').toBe(true);
  }
  for (const name of [en.player.startDubbing, en.player.sceneCredits]) await fullyVisible(choose.getByRole('button', { name, exact: true }), page, 44);
  await noHorizontalOverflow(page);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(668);
});

test('an eight-line role keeps every line and practice action visible on a short phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  const scene = readScene('gogo-missing-pen');
  const role = scene.roles.find((candidate: { selectable?: boolean }) => candidate.selectable !== false)!;
  const lines = scene.lines.filter((line: { roleId: string }) => line.roleId === role.id);
  expect(lines).toHaveLength(8);
  await page.goto(scenePath('gogo-missing-pen', undefined, 'en'));
  await page.getByRole('button', { name: en.player.startDubbing, exact: true }).click();
  const picker = page.getByRole('navigation', { name: en.player.yourLines, exact: true });
  const lineButtons = lines.map((line: { text: string }, index: number) => picker.getByRole('button', { name: `Line ${index + 1}: ${line.text}`, exact: true }));
  await expect(picker.getByRole('button')).toHaveCount(8);

  const checkLayout = async () => {
    for (const [index, button] of lineButtons.entries()) {
      await fullyVisible(button, page, 44);
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      const number = (await button.getByText(String(index + 1), { exact: true }).boundingBox())!;
      expect(Math.abs(number.width - 32), 'Number disk stays smaller than its touch target').toBeLessThanOrEqual(1);
      expect(Math.abs(number.height - 32), 'Number disk stays smaller than its touch target').toBeLessThanOrEqual(1);
    }
    for (const name of [en.player.listenToTheOriginalLine, en.player.record, en.player.myRecording, en.player.previousLine, en.player.next, en.player.startOver, en.player.sceneCredits]) {
      await fullyVisible(page.getByRole('button', { name, exact: true }), page, 44);
    }
    await noHorizontalOverflow(page);
    expect(await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))).toBeLessThanOrEqual(665);
    expect(await page.evaluate(() => scrollY)).toBeLessThanOrEqual(1);
  };
  // Check simultaneously before a click or focus can scroll an action into view.
  await expect(checkLayout).toPass({ timeout: 3000 });
  await lineButtons[7].click();
  await expect(lineButtons[7]).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('group', { name: en.player.dialogue, exact: true }).getByText(lines[7].text, { exact: true })).toBeVisible();
  await expect(checkLayout).toPass({ timeout: 3000 });
});

test('rotating a phone keeps both source shapes and lesson actions inside the landscape viewport', async ({ page }) => {
  const ui = en.player;
  for (const slug of ['onions', 'wumbo']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(scenePath(slug, undefined, 'en'));
    const movie = page.getByRole('region', { name: ui.movieScene, exact: true });
    const picture = movie.getByLabel(/dialogue scene$/);
    await expect.poll(() => picture.evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
    const aspect = await picture.evaluate((video: HTMLVideoElement) => video.videoWidth / video.videoHeight);
    const checkLandscape = async (step: 'choose' | 'practice' | 'result', workspace: Locator, required: string[]) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.setViewportSize({ width: 844, height: 390 });
      await expect(async () => {
        await expect(workspace).toBeVisible();
        const bounds = (await picture.boundingBox())!;
        const viewingArea = (await movie.getByRole('button', { name: step === 'result' ? ui.playMyDub : ui.playOriginalScene, exact: true }).boundingBox())!;
        const context = `${slug} ${step} landscape picture ${JSON.stringify(bounds)} in ${JSON.stringify(viewingArea)}`;
        // The native picture fills its available viewing column with complete edges.
        expect(Math.abs(bounds.width - bounds.height * aspect), context).toBeLessThan(1);
        expect(Math.abs(bounds.width - Math.min(viewingArea.width, viewingArea.height * aspect)), context).toBeLessThan(1);
        expect(bounds.x, context).toBeGreaterThanOrEqual(viewingArea.x - 1);
        expect(bounds.y, context).toBeGreaterThanOrEqual(viewingArea.y - 1);
        expect(bounds.x + bounds.width, context).toBeLessThanOrEqual(viewingArea.x + viewingArea.width + 1);
        expect(bounds.y + bounds.height, context).toBeLessThanOrEqual(viewingArea.y + viewingArea.height + 1);
        await fullyVisible(picture, page);
        for (const name of required) await fullyVisible(workspace.getByRole('button', { name, exact: true }), page, 44);
        for (const button of await page.getByRole('main').getByRole('button').all()) await fullyVisible(button, page, 44);
        await noHorizontalOverflow(page);
        const documentSize = await page.evaluate(() => ({
          height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
          scroll: scrollY,
        }));
        expect(documentSize.height, context).toBeLessThanOrEqual(391);
        expect(documentSize.scroll, context).toBeLessThanOrEqual(1);
      }).toPass({ timeout: 3000 });
    };
    const choose = page.getByRole('region', { name: ui.chooseARole, exact: true });
    await checkLandscape('choose', choose, [ui.startDubbing, ui.sceneCredits]);
    await choose.getByRole('button', { name: ui.startDubbing, exact: true }).click();
    const practice = page.getByRole('region', { name: ui.recordYourLines, exact: true });
    const scene = readScene(slug);
    const role = scene.roles.find((candidate: { selectable?: boolean }) => candidate.selectable !== false)!;
    for (const _ of scene.lines.filter((line: { roleId: string }) => line.roleId === role.id)) {
      await checkLandscape('practice', practice, [ui.listenToTheOriginalLine, ui.record, ui.myRecording, ui.previousLine, ui.next, ui.startOver, ui.sceneCredits]);
      await practice.getByRole('button', { name: ui.next, exact: true }).click();
    }
    await checkLandscape('result', page.getByRole('region', { name: ui.dubComplete, exact: true }),
      [ui.playMyDub, ui.editALine, en.download.downloadVideo, en.share.prepare, ui.startOver, ui.sceneCredits]);
  }
});
