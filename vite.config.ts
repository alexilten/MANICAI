/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  optimizeDeps: { exclude: ['rhino3dm'] },
  // full-stadium .3dm round-trips (tens of thousands of block instances) take a few seconds on CI runners
  test: { testTimeout: 60000 },
});
