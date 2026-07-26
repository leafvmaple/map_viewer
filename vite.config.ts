/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { readFileSync, createReadStream, existsSync, statSync } from 'fs';
import { join } from 'path';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));

/** Serve repo-root `res/` at `/res/*` (CONTRACT layout; not under public/). */
function serveResDir(): Plugin {
  const resRoot = resolve(__dirname, 'res');
  const mime: Record<string, string> = {
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
  };
  return {
    name: 'serve-res-dir',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.startsWith('/res/')) return next();
        const rel = decodeURIComponent(url.slice('/res/'.length));
        if (!rel || rel.includes('..')) {
          res.statusCode = 400;
          res.end('bad path');
          return;
        }
        const file = join(resRoot, rel);
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
        res.setHeader('Content-Type', mime[ext] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  define: {
    // Shown in the sidebar footer so a deployment is identifiable at a glance.
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [serveResDir()],
  test: {
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
  },
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
    // Serve res/ directory as static files (see serveResDir plugin)
    fs: {
      allow: ['.'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        demo3d: resolve(__dirname, '3d.html'),
      },
    },
  },
});
