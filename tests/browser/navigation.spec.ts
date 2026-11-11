import { test, expect, setLanguage } from './fixtures';

test('the readable Toy Story URL keeps its name through saving, reload and resume', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '选择片段：飞向宇宙！', exact: true }).click();
  await expect(page).toHaveURL(/\/scenes\/toy-story-infinity$/);
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/scenes\/toy-story-infinity\/dubs\/dub_[a-f0-9]{30}$/);
  const savedUrl = page.url();
  await page.reload();
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(page).toHaveURL(/\/library\/older-audience$/);
  await page.getByRole('button', { name: /^继续配音：飞向宇宙！/ }).click();
  await expect(page).toHaveURL(savedUrl);
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled();
  await setLanguage(page, 'en');
  await expect(page).toHaveURL(savedUrl);
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeEnabled();
});

test('folder paths follow selection, reload, Back and Forward', async ({ page }) => {
  await page.goto('/library/older-children');
  const categories = page.getByRole('group', { name: '片段分类', exact: true });
  const folder = categories.getByRole('button', { pressed: true });
  await expect(folder).toContainText('10–12岁');
  await categories.getByRole('button', { name: /^青少年/ }).click();
  await expect(page).toHaveURL(/\/library\/teens$/);
  await expect(folder).toContainText('青少年');
  await page.getByRole('searchbox').fill('not-a-scene');
  await page.goBack();
  await expect(folder).toContainText('10–12岁');
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await page.goForward();
  await expect(folder).toContainText('青少年');
  await page.reload();
  await expect(folder).toContainText('青少年');
  await setLanguage(page, 'en');
  await expect(page).toHaveURL(/\/library\/teens$/);
  await expect(page.getByRole('group', { name: 'Scene categories', exact: true }).getByRole('button', { pressed: true })).toContainText('Teenagers');
});

test('scene paths open directly, reload and return to their audience folder', async ({ page }) => {
  await page.goto('/scenes/ben-blue-hat');
  const start = page.getByRole('button', { name: '开始配音', exact: true });
  await expect(start).toBeEnabled();
  await page.reload();
  await expect(start).toBeEnabled();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(page).toHaveURL(/\/library\/younger-age-5$/);
  await expect(page.getByRole('group', { name: '片段分类', exact: true }).getByRole('button', { pressed: true })).toContainText('较小孩子');
  await page.getByRole('button', { name: '选择片段：我看起来怎么样？', exact: true }).click();
  await expect(page).toHaveURL(/\/scenes\/ben-blue-hat$/);
  await expect(start).toBeEnabled();
});

test('unsaved progress remains protected when leaving a scene path', async ({ page }) => {
  await page.goto('/library/older-audience');
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
  await expect(page).toHaveURL(/\/library\/older-audience$/);
  await expect(page.getByRole('searchbox')).toBeVisible();
});
