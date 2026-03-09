import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // @tailwindcss/vite resolves CSS @imports via the filesystem, bypassing
      // package.json exports conditions. Map the logical path to the real file.
      '@ugsys/ui-lib/tokens.css': resolve(
        __dirname,
        'node_modules/@ugsys/ui-lib/dist/tokens.css',
      ),
    },
    conditions: ['style', 'import', 'module', 'default'],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
