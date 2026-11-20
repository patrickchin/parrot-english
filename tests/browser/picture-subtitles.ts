import { expect, type Page } from '@playwright/test';

export async function expectPictureSubtitles(page: Page, movieName: string, dialogueName: string) {
  const movie = page.getByRole('region', { name: movieName, exact: true });
  const picture = movie.getByLabel(/dialogue scene$|对话片段$/);
  const subtitles = page.getByRole('group', { name: dialogueName, exact: true });
  await expect(subtitles).toHaveCount(1);
  await expect(movie.getByRole('group', { name: dialogueName, exact: true })).toHaveCount(1);
  await expect(subtitles).toBeVisible();
  const play = movie.getByRole('button', { name: /^(播放原片|播放我的配音|Play original scene|Play my dub)$/ });
  // Captions can use the black bars beside portrait footage. During playback
  // the picture button disappears; its parent viewing area keeps the same bounds.
  const image = await play.count() ? (await play.boundingBox())! : await picture.evaluate(video => {
    const box = video.parentElement!.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  const assertInside = async (target: typeof subtitles) => {
    const box = (await target.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(image.x - 1);
    expect(box.y).toBeGreaterThanOrEqual(image.y - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(image.x + image.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(image.y + image.height + 1);
  };
  await assertInside(subtitles);
  expect((await subtitles.boundingBox())!.y, 'subtitles leave the recording indicator clear').toBeGreaterThanOrEqual(image.y + 48 - 1);
  for (const text of await subtitles.locator('[lang="en"], [lang="zh-CN"]').all()) await assertInside(text);
  const progress = (await movie.getByRole('slider').or(movie.getByRole('progressbar')).boundingBox())!;
  const caption = (await subtitles.boundingBox())!;
  expect(caption.y + caption.height, 'subtitles stay on the picture above transport').toBeLessThanOrEqual(progress.y + 1);
}
