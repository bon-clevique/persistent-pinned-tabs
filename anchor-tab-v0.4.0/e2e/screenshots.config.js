import { defineConfig } from '@playwright/test';

// Dedicated config for Chrome Web Store screenshot generation.
// Keeps screenshots out of the regular E2E run.
export default defineConfig({
  testDir: './screenshots',
  workers: 1,
  timeout: 120000,
  reporter: 'list',
  retries: 0,
  use: { headless: false },
});
