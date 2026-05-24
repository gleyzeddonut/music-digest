import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
