/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Round 08: the app shows its version and build so a saved file or a bug report can name both
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const commit = (() => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'local'; }
})();

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  optimizeDeps: { exclude: ['rhino3dm'] },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(commit),
    __APP_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: {
    // three.js and React change less often than MANICAI: separate files stay cached across deploys
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (/node_modules\/(three|three-stdlib|postprocessing|@react-three)\//.test(id)) return 'three';
          if (/node_modules\/(react|react-dom|scheduler|zustand)\//.test(id)) return 'react';
        },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  // full-stadium .3dm round-trips (tens of thousands of block instances) take a few seconds on CI runners
  test: { testTimeout: 60000 },
});
