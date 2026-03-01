import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    open: true,
    // Serve res/ directory as static files
    fs: {
      allow: ['.'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
