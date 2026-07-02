import { defineConfig } from '@playwright/test';

/**
 * E2E tests drive the real app in a real browser against the Vite dev server.
 *
 * They need game data in the working tree (res/ + public/games/registry.json —
 * git-ignored, produced by nes_decoder): the specs adapt to whatever games are
 * present and skip data-dependent cases when the data is missing.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false, // one dev server, deterministic input timing
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3199',
    viewport: { width: 1400, height: 900 },
  },
  webServer: {
    command: 'npm run dev -- --port 3199 --strictPort',
    url: 'http://localhost:3199',
    reuseExistingServer: true,
    env: { BROWSER: 'none' },
  },
});
