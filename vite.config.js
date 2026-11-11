// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages 项目站的地址是 /仓库名/，所以必须设置 base，否则线上会白屏
  base: '/in-possible/',

  plugins: [react()],

  server: { host: true },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
});