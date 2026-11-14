import { test, expect, setLanguage, headerDestination } from './fixtures';
import { clips, packs } from '../content-fixtures';

test('the readable Toy Story URL keeps its name through saving, reload and resume', async ({ page }) => {
  await page.goto('/library/all');
  await page.getByRole('button', { name: '选择片段：飞向宇宙！', exact: true }).click();
  await expect(page).toHaveURL(/\/scenes\/toy-story-infinity$/);
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/scenes\/toy-story-infinity\/dubs\/dub_[a-f0-9]{30}$/);
  const savedUrl = page.url();
  await page.reload();
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(page).toHaveURL(/\/library\/all$/);
  await (await headerDestination(page, '我的配音')).click();
  await page.getByRole('button', { name: /^继续配音：飞向宇宙！/ }).click();
  const resumedUrl = new URL(savedUrl);
  resumedUrl.searchParams.set('pack', clips.find(clip => clip.routeSlug === 'toy-story-infinity')!.packId);
  await expect(page).toHaveURL(resumedUrl.href);
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled();
  await setLanguage(page, 'en');
  await expect(page).toHaveURL(resumedUrl.href.replace('/zh/', '/en/'));
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeEnabled();
});

test('pack paths follow selection, reload, Back and Forward', async ({ page }) => {
  await page.goto('/en/');
  await page.getByRole('link', { name: 'Shrek', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/packs/' + packs.find(pack => pack.data.title === 'Shrek')!.entry.id + '$'));
  await page.getByRole('link', { name: 'All packs', exact: true }).click();
  await page.getByRole('link', { name: 'Friends', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/packs/' + packs.find(pack => pack.data.title === 'Friends')!.entry.id + '$'));
  await page.getByRole('searchbox').fill('not-a-scene');
  await page.goBack();
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await page.reload();
  await setLanguage(page, 'zh-CN');
  await expect(page.getByRole('heading', { level: 1, name: 'Friends', exact: true })).toBeVisible();
});

test('scene paths open directly, reload and return to their audience folder', async ({ page }) => {
  await page.goto('/scenes/first-english-good-morning');
  const start = page.getByRole('button', { name: '开始配音', exact: true });
  await expect(start).toBeEnabled();
  await page.reload();
  await expect(start).toBeEnabled();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(page).toHaveURL(/\/library\/all$/);
  await expect(page.getByRole('heading', { level: 1, name: '全部片段', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '选择片段：早上好！你好吗？', exact: true }).click();
  await expect(page).toHaveURL(/\/scenes\/first-english-good-morning$/);
  await expect(start).toBeEnabled();
});

test('unsaved progress remains protected when leaving a scene path', async ({ page }) => {
  await page.goto('/library/all');
  await page.evaluate(() => { IDBObjectStore.prototype.put = () => { throw new DOMException('Storage disabled', 'SecurityError'); }; });
  await page.getByRole('button', { name: '选择片段：不，这是派大星！', exact: true }).click();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('无法保存到本机');
  await page.goBack();
  const dialog = page.getByRole('dialog', { name: '离开这次配音？', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '保留录音，继续玩', exact: true }).click();
  await expect(page).toHaveURL(/\/scenes\/patrick$/);
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '丢弃未保存的改动', exact: true }).click();
  await expect(page).toHaveURL(/\/library\/all$/);
  await expect(page.getByRole('searchbox')).toBeVisible();
});


test('My dubs is a separate page with direct links, history, language and an empty state', async ({ page }) => {
  await page.goto('/zh/packs/' + packs.find(pack => pack.data.title === 'Shrek')!.entry.id);
  await expect(page.getByRole('region', { name: '我的配音', exact: true })).toHaveCount(0);
  const dubsLink = await headerDestination(page, '我的配音');
  await expect(dubsLink).toHaveAttribute('href', '/zh/dubs');
  await dubsLink.click();
  await expect(page).toHaveURL(/\/dubs$/);
  await expect(await headerDestination(page, '我的配音')).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { level: 1, name: '我的配音', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '还没有配音', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp('/packs/' + packs.find(pack => pack.data.title === 'Shrek')!.entry.id + '$'));
  await expect(page.getByRole('searchbox')).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: '还没有配音', exact: true })).toBeVisible();
  await page.reload();
  await setLanguage(page, 'en');
  await expect(page).toHaveURL(/\/dubs$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My dubs');
  await expect(page.getByRole('heading', { name: 'No dubs yet', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My dubs');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(await headerDestination(page, 'My dubs')).toBeInViewport();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'Browse scenes', exact: true }).click();
  await expect(page.getByRole('searchbox')).toBeVisible();
  await expect(await headerDestination(page, 'Packs')).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await page.goto('/dubs/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My dubs');
});

test('My dubs shows storage read failures and retries without an empty-state claim', async ({ page }) => {
  await page.goto('/dubs');
  await expect(page.getByRole('heading', { name: '还没有配音', exact: true })).toBeVisible();
  await (await headerDestination(page, '内容包')).click();
  await page.evaluate(() => {
    const open = indexedDB.open.bind(indexedDB);
    (window as Window & { restoreStorage?: () => void }).restoreStorage = () => { indexedDB.open = open; };
    indexedDB.open = () => { throw new DOMException('Storage disabled', 'SecurityError'); };
  });
  await (await headerDestination(page, '我的配音')).click();
  await expect(page.getByRole('alert')).toContainText('无法读取本机配音');
  await expect(page.getByRole('heading', { name: '还没有配音', exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as Window & { restoreStorage?: () => void }).restoreStorage!());
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '还没有配音', exact: true })).toBeVisible();
});


test('navigation shares the language-selector row and its compact menu supports the keyboard', async ({ page }) => {
  for (const path of ['/library/all', '/dubs', '/packs']) {
    await page.goto(path);
    await setLanguage(page, 'en');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const menu = page.getByRole('button', { name: 'Main navigation', exact: true });
      const compact = await menu.isVisible();
      const control = compact ? menu : page.getByRole('link', { name: 'My dubs', exact: true });
      const language = page.getByRole('combobox');
      await expect(control).toBeInViewport();
      const navigationBox = (await control.boundingBox())!;
      const languageBox = (await language.boundingBox())!;
      expect(Math.abs(navigationBox.y + navigationBox.height / 2 - languageBox.y - languageBox.height / 2)).toBeLessThan(1);
      expect(navigationBox.x + navigationBox.width).toBeLessThanOrEqual(languageBox.x + 1);
      const brand = (await page.getByRole('link', { name: 'Parrotbook home', exact: true }).boundingBox())!;
      const firstNavigation = compact ? navigationBox : (await page.getByRole('link', { name: 'Packs', exact: true }).boundingBox())!;
      expect(brand.x + brand.width).toBeLessThanOrEqual(firstNavigation.x + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (compact) {
        await menu.focus(); await menu.press('Enter');
        await expect(page.getByRole('menu')).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'My dubs', exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menu).toBeFocused();
      }
    }
  }
});
