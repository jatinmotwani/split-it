import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3200);
const baseURL = `http://localhost:${PORT}`;

// Set PW_CHROMIUM_PATH when the machine ships its own Chromium build (for example a cloud sandbox).
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath },
  },
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: process.env.E2E_SKIP_BUILD
      ? `pnpm start --port ${PORT}`
      : `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      APP_URL: baseURL,
      BETTER_AUTH_URL: baseURL,
      ...(process.env.E2E_DATABASE_URL ? { DATABASE_URL: process.env.E2E_DATABASE_URL } : {}),
    },
  },
});
