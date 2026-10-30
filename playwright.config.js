import { defineConfig, devices } from '@playwright/test';

// Os servidores normalmente já foram subidos pelo ./init.sh; se não, o Playwright sobe.
export default defineConfig({
  testDir: 'tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['Pixel 5'],
    viewport: { width: 360, height: 740 },
  },
  webServer: [
    {
      command: 'npx firebase emulators:start --only auth,database --project demo-dinamica',
      port: 9000,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run serve',
      port: 5173,
      reuseExistingServer: true,
    },
  ],
});
