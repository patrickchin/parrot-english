import { test, expect, setLanguage } from './fixtures';
import { clips } from '../content-fixtures';

test('scene search finds tags and full dialogue and remains scoped to a selected pack', async ({ page }) => {
  await page.goto('/library/all');
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
  await expect(results).toHaveCount(clips.length);
  await page.getByRole('link', { name: '全部内容包', exact: true }).click();
  await page.getByRole('link', { name: 'English Singsing', exact: true }).click();
  await expect(results).toHaveCount(clips.filter(clip => clip.note === 'English Singsing').length);
  await search.fill('SpongeBob');
  await expect(results).toHaveCount(0);
  await search.fill('good morning');
  await expect(page.getByRole('button', { name: '选择片段：早上好！你好吗？', exact: true })).toBeVisible();
  await search.fill('swim');
  await expect(page.getByRole('button', { name: '选择片段：你会游泳吗？', exact: true })).toBeVisible();
});

test('tag and title results rank above scenes that only mention the query in dialogue', async ({ page }) => {
  await page.goto('/library/all');
  await setLanguage(page, 'en');
  await page.getByRole('searchbox', { name: 'Find a scene' }).fill('food');
  const results = page.getByRole('listitem');
  // Metadata matches precede a scene that mentions food only in dialogue,
  // independently of source pack ordering or other newly published matches.
  await expect(page.getByRole('button', { name: 'Choose scene: Fish are friends!', exact: true })).toBeVisible();
  const names = await results.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')));
  const dialogue = names.indexOf('Choose scene: Fish are friends!');
  for (const title of ['Chocolate?!', 'Ogres are like onions', 'Anyone can cook!', "I'm not upset!", 'Is mayonnaise an instrument?']) {
    const index = names.indexOf('Choose scene: ' + title);
    expect(index).toBeGreaterThanOrEqual(0); expect(index).toBeLessThan(dialogue);
  }
  await page.getByRole('searchbox').fill('i’m READY');
  await expect(results.first().getByRole('button')).toHaveAccessibleName('Choose scene: I’m ready!');
});
