import { test, expect, setLanguage } from './fixtures';

test.use({ sampleScene: true });

test('an explicit language URL takes priority over the remembered preference', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('parrotbook-ui-language', 'zh-CN'));
  await page.goto('/en/scenes/patrick');
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle('Parrotbook · English dubbing');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  const url = page.url();
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page).toHaveURL(url);
  await page.goto('/zh/library/teens');
  await expect(page.getByRole('searchbox', { name: '查找片段', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('link', { name: 'Parrotbook 首页', exact: true })).toHaveAttribute('href', '/zh/');
});

test('an unprefixed entry uses the saved preference without adding a Back entry', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('parrotbook-ui-language', 'en'));
  await page.goto('/library/teens');
  await expect(page).toHaveURL(/\/en\/library\/teens$/);
  await expect(page.getByRole('searchbox', { name: 'Find a scene', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Choose scene:/ }).first().click();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/en\/scenes\//);
  await page.goBack();
  await expect(page).toHaveURL(/\/en\/library\/teens$/);
  await expect(page.getByRole('searchbox', { name: 'Find a scene', exact: true })).toBeVisible();
});

test('language history preserves the running player, saved dub and selected line', async ({ page }) => {
  let loads = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/scenes/patrick/scene.json') loads++; });
  await page.goto('/zh/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  const line = "I'm searching for someone.";
  await expect(page.getByRole('button', { name: `第 2 句：${line}`, exact: true })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/zh\/scenes\/patrick\/dubs\/dub_[a-f0-9]{30}$/);
  const chinese = page.url();
  const video = await page.locator('video').elementHandle();
  const initialLoads = loads;
  expect(initialLoads).toBeGreaterThan(0);
  await setLanguage(page, 'en');
  await expect(page).toHaveURL(chinese.replace('/zh/', '/en/'));
  await expect(page.getByRole('button', { name: `Line 2: ${line}`, exact: true })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await video!.evaluate(element => element.isConnected)).toBe(true);
  expect(loads).toBe(initialLoads);
  await page.goBack();
  await expect(page).toHaveURL(chinese);
  await expect(page.getByRole('button', { name: `第 2 句：${line}`, exact: true })).toHaveAttribute('aria-current', 'step');
  await page.goForward();
  await expect(page).toHaveURL(chinese.replace('/zh/', '/en/'));
  expect(await video!.evaluate(element => element.isConnected)).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: `Line 2: ${line}`, exact: true })).toHaveAttribute('aria-current', 'step');
});

test('switching language preserves unsaved progress and its leave warning', async ({ page }) => {
  await page.goto('/zh/scenes/patrick');
  await page.evaluate(() => { IDBObjectStore.prototype.put = () => { throw new DOMException('Storage disabled', 'SecurityError'); }; });
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('无法保存到本机');
  await setLanguage(page, 'en');
  await expect(page).toHaveURL(/\/en\/scenes\/patrick$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Could not save on this device');
  await expect(page.getByRole('link', { name: 'Manage saved dubs in a new tab', exact: true })).toHaveAttribute('href', /^\/en\//);
  await page.getByRole('button', { name: 'Back to scenes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Leave this dub?', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep recordings and continue', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/scenes\/patrick$/);
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeEnabled();
});

test('Back to an earlier language entry keeps a dub saved after that entry was created', async ({ page }) => {
  await page.goto('/zh/scenes/patrick');
  await setLanguage(page, 'en');
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/scenes\/patrick\/dubs\/dub_[a-f0-9]{30}$/);
  const english = page.url();
  const video = await page.locator('video').elementHandle();
  await page.goBack();
  await expect(page).toHaveURL(english.replace('/en/', '/zh/'));
  await expect(page.getByRole('button', { name: "第 2 句：I'm searching for someone.", exact: true })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await video!.evaluate(element => element.isConnected)).toBe(true);
  await page.goForward();
  await expect(page).toHaveURL(english);
  expect(await video!.evaluate(element => element.isConnected)).toBe(true);
});

test('the default is Chinese and explicit URLs keep working when storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Unavailable', 'SecurityError'); } });
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/zh\/$/);
  await setLanguage(page, 'en');
  await expect(page).toHaveURL(/\/en\/$/);
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Find a scene', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Parrotbook home', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.getByRole('searchbox', { name: 'Find a scene', exact: true })).toBeVisible();
});
