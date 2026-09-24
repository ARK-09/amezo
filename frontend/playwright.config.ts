import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  webServer: {
    // plain vite, not `pnpm dev` — e2e needs a fixed, unauthenticated port,
    // not portless's named HTTPS proxy
    command: 'pnpm exec vite --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:5173',
  },
})
