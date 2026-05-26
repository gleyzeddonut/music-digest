import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  root: 'src',
  base: './',
  publicDir: '../public-static',
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: { port: 5173 },
  plugins: [react()],
});
