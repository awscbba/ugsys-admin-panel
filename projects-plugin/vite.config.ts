import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig(({ command, mode }) => ({
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
  // Replace process.env.NODE_ENV at build time only — IIFE bundles run in the
  // browser where `process` is undefined, causing a ReferenceError that
  // prevents the window.__mfe_projects_registry assignment from executing.
  // During tests (command === 'serve', mode === 'test') we skip this so React
  // loads its development build, which supports act().
  ...(command === 'build'
    ? { define: { 'process.env.NODE_ENV': JSON.stringify('production') } }
    : {}),
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
}));
