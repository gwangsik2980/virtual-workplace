/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages는 https://<user>.github.io/virtual-workplace/ 경로로 서비스된다.
export default defineConfig({
  base: '/virtual-workplace/',
  plugins: [react()],
  test: { globals: true, environment: 'node' },
});
