import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@domain': resolve(__dirname, 'src/domain'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@presentation': resolve(__dirname, 'src/presentation'),
      '@ugsys/ui-lib/tokens.css': resolve(
        __dirname,
        'node_modules/@ugsys/ui-lib/dist/tokens.css',
      ),
    },
    conditions: ['style', 'import', 'module', 'default'],
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'entry.ts'),
      name: '__mfe_projects_registry',
      formats: ['iife'],
      fileName: () => 'projects-plugin.js',
    },
    outDir: 'dist',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest-setup.ts'],
  },
});
