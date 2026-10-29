import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 45000, expect: { timeout: 10000 },
  workers: 2, reporter: 'list', use: { baseURL: 'http://127.0.0.1:4317', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run dev -- --port 4317 --strictPort', url: 'http://127.0.0.1:4317', reuseExistingServer: !process.env.CI },
    { command: 'npm run build && npm run preview -- --port 4319 --strictPort', url: 'http://127.0.0.1:4319', reuseExistingServer: !process.env.CI },
  ],
  projects: [
    { name: 'chromium', testIgnore: '**/production.spec.ts', use: { ...devices['Desktop Chrome'], permissions: ['microphone'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } } },
    { name: 'mobile', testIgnore: '**/production.spec.ts', use: { ...devices['Pixel 7'], permissions: ['microphone'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } } },
    { name: 'webkit', testIgnore: '**/production.spec.ts', use: { ...devices['iPhone 13'] } },
    { name: 'production', testMatch: '**/production.spec.ts', use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4319' } },
  ],
});
