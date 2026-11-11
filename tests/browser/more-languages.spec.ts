import { test, expect, setLanguage } from './fixtures';

const added = [
  { code: 'es', label: 'Español', title: 'Parrotbook · Doblaje en inglés', start: 'Empezar a doblar', search: 'Buscar una escena', dubs: 'Mis doblajes', next: 'Siguiente', line: "Frase 2: I'm searching for someone." },
  { code: 'ja', label: '日本語', title: 'Parrotbook · 英語で吹き替え', start: '吹き替えを始める', search: 'シーンを探す', dubs: '自分の吹き替え', next: '次へ', line: "セリフ2：I'm searching for someone." },
  { code: 'ko', label: '한국어', title: 'Parrotbook · 영어 더빙', start: '더빙 시작', search: '장면 찾기', dubs: '내 더빙', next: '다음', line: "대사 2: I'm searching for someone." },
] as const;

for (const language of added) test(`${language.code} opens directly, persists, and fits a phone`, async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('parrotbook-ui-language')) localStorage.setItem('parrotbook-ui-language', 'en'); });
  await page.goto(`/${language.code}/scenes/patrick`);
  await expect(page.getByRole('button', { name: language.start, exact: true })).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('lang', language.code);
  await expect(page).toHaveTitle(language.title);
  await expect(page.getByRole('combobox')).toContainText(language.label);
  await page.setViewportSize({ width: 360, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const selector = await page.getByRole('combobox').boundingBox();
  expect(selector!.width).toBeGreaterThanOrEqual(44);
  expect(selector!.height).toBeGreaterThanOrEqual(44);
  await page.reload();
  await expect(page.getByRole('button', { name: language.start, exact: true })).toBeEnabled();
  await page.goto(`/${language.code}/library/teens`);
  await expect(page.getByRole('searchbox', { name: language.search, exact: true })).toBeVisible();
  await page.goto(`/${language.code}/dubs`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(language.dubs);
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/${language.code}/$`));
  await expect(page.getByRole('searchbox', { name: language.search, exact: true })).toBeVisible();
});

test.describe('saved player language changes', () => {
  test.use({ sampleScene: true });

  test('new languages and history retain the same saved dub, line and video', async ({ page }) => {
    await page.goto('/en/scenes/patrick');
    await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/scenes\/patrick\/dubs\/dub_[a-f0-9]{30}$/);
    const original = page.url();
    const video = await page.locator('video').elementHandle();
    for (const language of added) {
      await setLanguage(page, language.code);
      await expect(page).toHaveURL(original.replace('/en/', `/${language.code}/`));
      await expect(page.getByRole('button', { name: language.line, exact: true })).toHaveAttribute('aria-current', 'step');
      expect(await video!.evaluate(element => element.isConnected)).toBe(true);
    }
    await page.goBack();
    await expect(page.getByRole('button', { name: added[1].line, exact: true })).toHaveAttribute('aria-current', 'step');
    await page.goForward();
    await expect(page.getByRole('button', { name: added[2].line, exact: true })).toHaveAttribute('aria-current', 'step');
    await page.reload();
    await expect(page.getByRole('button', { name: added[2].line, exact: true })).toHaveAttribute('aria-current', 'step');
  });
});
