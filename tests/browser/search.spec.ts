import { test, expect, setLanguage } from './fixtures';
import { youngerClips } from '../../src/catalog';

test('scene search finds tags and full dialogue while preserving audience folders', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: '查找片段', exact: true });
  const results = page.getByRole('listitem');
  for (const query of ['  SPONGEBOB  ', 'sponge bob', '海绵宝宝', 'Spongebb']) {
    await search.fill(query);
    await expect(results).toHaveCount(5);
    await expect(results.first().getByRole('button')).toHaveAccessibleName('选择片段：不，这是派大星！');
  }
  await search.fill('SpongeBob Patrick');
  await expect(results).toHaveCount(4);
  for (const query of ['Horseradish', '辣根', 'SpongeBob horseradish', 'horseradsh', 'spongebb horseradsh']) {
    await search.fill(query);
    await expect(results).toHaveCount(1);
    await expect(results.getByRole('button')).toHaveAccessibleName('选择片段：蛋黄酱是乐器吗？');
  }
  await search.fill('Heineken');
  await expect(page.getByRole('status')).toHaveText('没有找到片段。');
  await page.getByRole('button', { name: '清除搜索', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(results).toHaveCount(24);
  await page.getByRole('group', { name: '片段分类' }).getByRole('button', { name: /^较小孩子/ }).click();
  await expect(results).toHaveCount(youngerClips.length);
  await search.fill('SpongeBob');
  await expect(results).toHaveCount(0);
  await search.fill('magic');
  await expect(page.getByRole('button', { name: '选择片段：我看起来怎么样？', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择片段：我可以和本一起玩吗？', exact: true })).toBeVisible();
});

test('tag and title results rank above scenes that only mention the query in dialogue', async ({ page }) => {
  await page.goto('/');
  await setLanguage(page, 'en');
  await page.getByRole('searchbox', { name: 'Find a scene' }).fill('food');
  const results = page.getByRole('listitem');
  // All five food-tagged scenes must precede Fish Friends, which says it only in dialogue.
  await expect(results).toContainText(['Chocolate?!', 'Ogres are like onions', 'Anyone can cook', 'upset', 'mayonnaise']);
  await expect(results.first().getByRole('button')).toHaveAccessibleName('Choose scene: Chocolate?!');
  const names = await results.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')));
  expect(names.indexOf('Choose scene: Fish are friends!')).toBeGreaterThan(4);
  await page.getByRole('searchbox').fill('i’m READY');
  await expect(results).toHaveCount(1);
  await expect(results.getByRole('button')).toHaveAccessibleName('Choose scene: I’m ready!');
});
