import { defineConfig, devices } from '@playwright/test';

const SHOW_BROWSER = true;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? undefined : undefined,
  timeout: 60000,

  reporter: [
    ['line'],
    ['json', { outputFile: 'playwright-report.json' }],
    ['html', { open: 'never' }],
  ],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],

        // 👇 THIS is the important part
        headless: false,
        launchOptions: {
          args: SHOW_BROWSER
            ? [
                '--window-size=1200,800',
                '--window-position=-3840,100', // Adjust window position to two monitors to the left
              ]
    : [
        '--window-size=800,600',
        '--window-position=20000,20000',
      ],
},
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});