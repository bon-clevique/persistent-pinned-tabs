import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  workers: 1,
  timeout: 60000,
  reporter: 'list',
  retries: 1,
  use: { headless: false },
});
