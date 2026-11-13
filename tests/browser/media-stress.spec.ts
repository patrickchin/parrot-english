import { waveformImage } from './waveform-pixels';
import { test, expect } from './fixtures';
import { prepareMediaTest, type MediaAudit } from './media-fixture';

test.use({ sampleScene: true, actionTimeout: 10000 });

const seeds = process.env.STRESS_SEED ? [Number(process.env.STRESS_SEED)] : [17, 2026, 91];
const steps = Number(process.env.STRESS_STEPS ?? 24);

for (const seed of seeds) test(`@stress mixed recording actions preserve takes and release resources (seed ${seed})`, async ({ page }, info) => {
  test.setTimeout(steps * 7000 + 60000);
  const actions: string[] = [], errors: string[] = [], uploads: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) uploads.push(request.url()); });
  let randomState = seed >>> 0;
  const random = (length: number) => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState % length;
  };
  const labels = await prepareMediaTest(page);
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const wave = page.getByRole('img', { name: '你的声音波形', exact: true });
  const takes = new Map<number, string>();
  let selected = 0;
  async function idle() {
    await expect(button('听这一句原声')).toBeEnabled();
    await expect(page.locator('video')).toHaveJSProperty('paused', true);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(button(labels[selected])).toHaveAttribute('aria-current', 'step');
    await expect(button('听我的录音')).toBeEnabled({ enabled: takes.has(selected) });
    if (takes.has(selected)) await expect.poll(() => waveformImage(wave)).toBe(takes.get(selected)!);
    await expect.poll(() => page.evaluate(() => {
      const audit = (window as unknown as { mediaAudit: MediaAudit }).mediaAudit;
      return { microphones: audit.tracks.filter(track => track.readyState === 'live').length, sources: audit.sources.size };
    })).toEqual({ microphones: 0, sources: 0 });
    expect(errors).toEqual([]);
    expect(uploads).toEqual([]);
  }
  async function record() {
    await button(takes.has(selected) ? '重新录这一句' : '开始录音').click();
    await expect(button('停止录音')).toBeVisible();
    await expect(button('听我的录音')).toBeEnabled();
    takes.set(selected, await waveformImage(wave));
  }
  try {
    await page.goto('/zh/scenes/patrick');
    await button('开始配音').click();
    // Establish real saved takes before mixing destructive-looking operations.
    for (selected = 0; selected < labels.length; selected++) {
      await button(labels[selected]).click(); await record();
    }
    selected = labels.length - 1;
    const choices = ['record', 'cancel-capture', 'cancel-permission', 'original', 'listen', 'line', 'reload', 'history', 'reset-cancel', 'result', 'interrupt-help'];
    let bag: string[] = [];
    for (let step = 0; step < steps; step++) {
      if (!bag.length) bag = [...choices];
      const action = bag.splice(random(bag.length), 1)[0];
      actions.push(`${step}: ${action}, line ${selected + 1}`);
      await test.step(actions.at(-1)!, async () => {
        switch (action) {
          case 'record': await record(); break;
          case 'cancel-capture':
            await button('重新录这一句').click();
            await expect(button('停止录音')).toBeVisible();
            await button('取消').click(); break;
          case 'cancel-permission': {
            const tracksBefore = await page.evaluate(() => (window as unknown as { mediaAudit: MediaAudit }).mediaAudit.tracks.length);
            await page.evaluate(() => { (window as unknown as { mediaAudit: MediaAudit }).mediaAudit.microphoneDelay = 250; });
            await button('重新录这一句').click(); await button('取消').click();
            // Allow the late stream to arrive; it must be stopped without saving.
            await expect.poll(() => page.evaluate(() => (window as unknown as { mediaAudit: MediaAudit }).mediaAudit.tracks.length)).toBe(tracksBefore + 1);
            await expect.poll(() => page.evaluate(() => (window as unknown as { mediaAudit: MediaAudit }).mediaAudit.tracks.at(-1)?.readyState)).toBe('ended');
            await page.evaluate(() => { (window as unknown as { mediaAudit: MediaAudit }).mediaAudit.microphoneDelay = 0; });
            break;
          }
          case 'original': case 'listen':
            await button(action === 'original' ? '听这一句原声' : '听我的录音').click();
            await expect(button('停止播放')).toBeVisible();
            await page.waitForTimeout(random(90));
            await button('停止播放').click(); break;
          case 'line': selected = random(labels.length); await button(labels[selected]).click(); break;
          case 'reload':
            await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
            await page.reload(); break;
          case 'history':
            await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
            await button('返回片段').click(); await expect(page.getByRole('searchbox')).toBeVisible();
            await page.goBack(); break;
          case 'reset-cancel':
            await button('重新开始').click();
            await page.getByRole('dialog').getByRole('button', { name: '保留录音，继续玩', exact: true }).click(); break;
          case 'result':
            selected = labels.length - 1; await button(labels[selected]).click(); await button('看我的配音').click();
            await page.getByRole('region', { name: '配音完成', exact: true }).getByRole('button', { name: '播放我的配音', exact: true }).click();
            await expect(button('停止播放')).toBeVisible(); await button('停止播放').click();
            await button('再改一句').click(); selected = 0; break;
          case 'interrupt-help':
            await button('听我的录音').click(); await expect(button('停止播放')).toBeVisible();
            await button('怎么配音？').click(); await page.getByRole('dialog').getByRole('button', { name: '知道了', exact: true }).click(); break;
        }
        await idle();
      });
    }
    await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
    await page.reload();
    for (selected = 0; selected < labels.length; selected++) {
      await button(labels[selected]).click(); await idle();
    }
  } finally {
    const media = await page.evaluate(() => {
      const audit = (window as unknown as { mediaAudit: MediaAudit }).mediaAudit;
      return {
        captures: audit?.captures,
        playback: audit?.playback,
        inputs: audit?.inputs.map(context => ({ time: context.currentTime, state: context.state })),
        alerts: [...document.querySelectorAll('[role="alert"]')].map(alert => alert.textContent),
      };
    }).catch(() => undefined);
    await info.attach('stress-actions', { body: JSON.stringify({ seed, steps, actions, errors, uploads, media }, null, 2), contentType: 'application/json' });
  }
});
