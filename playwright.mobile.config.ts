import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 21337);
const baseURL = `http://127.0.0.1:${port}`;

// A bounded, opt-in matrix against one fresh production build. This avoids the
// development module connection churn that exhausted the local TCP pool before.
export default defineConfig({
  testDir: './tests/browser', timeout: 60000, expect: { timeout: 10000 },
  workers: 1, reporter: 'list', use: { baseURL, trace: 'retain-on-failure' },
  testMatch: /(?:mobile-matrix|mobile-recording|media-diagnostics|transient-media|saved-dubs|guest-sharing|owner-packs|shared-dub)\.spec\.ts/,
  grep: /recorded replay diagnostics|capture waits for a parked|slow speaker output|tolerates transient|a captured take survives|persistent clock discrepancy|bounded buffering failure|phone and tablet layouts|blocked video start|pending audio resume|partial dubs survive|a cached video|owner access protects|an owner publishes|owner management hides|account-free playback|shared video .*recovery state/,
  webServer: { command: `npm run build && npm run preview -- --port ${port} --strictPort`, url: baseURL, reuseExistingServer: false },
  projects: [
    { name: 'mobile-qa-chromium', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'mobile-qa-webkit', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } },
    // Firefox does not support Playwright's isMobile option. This is desktop
    // Firefox with a touch-enabled phone viewport, not Firefox for Android.
    { name: 'mobile-qa-firefox', use: { browserName: 'firefox', viewport: { width: 390, height: 844 }, hasTouch: true, launchOptions: { timeout: 30000 } } },
  ],
});
