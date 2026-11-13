import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4317);
const baseURL = `http://127.0.0.1:${port}`;
const productionURL = `http://127.0.0.1:${port + 2}`;
export default defineConfig({
  testDir: './tests/browser', timeout: 45000, expect: { timeout: 10000 },
  workers: 2, reporter: 'list', use: { baseURL, trace: 'retain-on-failure' },
  webServer: [
    // Never silently test a different checkout's server or an outdated build.
    { command: `npm run dev -- --port ${port} --strictPort`, url: baseURL, reuseExistingServer: false },
    { command: `npm run build && npm run preview -- --port ${port + 2} --strictPort`, url: productionURL, reuseExistingServer: false },
  ],
  projects: [
    { name: 'chromium', testIgnore: '**/production.spec.ts', use: { ...devices['Desktop Chrome'], permissions: ['microphone'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } } },
    { name: 'mobile', testIgnore: '**/production.spec.ts', use: { ...devices['Pixel 7'], permissions: ['microphone'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } } },
    { name: 'webkit', testIgnore: '**/production.spec.ts', use: { ...devices['iPhone 13'] } },
    { name: 'production', testMatch: '**/production.spec.ts', use: { ...devices['Desktop Chrome'], baseURL: productionURL } },
    { name: 'production-media', testMatch: '**/media-*.spec.ts', use: { ...devices['Desktop Chrome'], baseURL: productionURL } },
  ],
});
