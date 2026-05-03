import type { ConfigEnv, UserConfig } from 'vite';
import { defineConfig } from 'vite';
import { pluginExposeRenderer } from './vite.base.config';
import vue from '@vitejs/plugin-vue'
// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<'renderer'>;
  const { root, mode, forgeConfigSelf } = forgeEnv;
  const name = forgeConfigSelf.name ?? '';

  return {
    root,
    mode,
    base: './',
    build: {
      outDir: `.vite/renderer/${name}`,
    },
    // Align with main process URL: avoid Windows localhost/IPv6 mismatches and random ports vs. baked-in define.
    server: {
      host: '127.0.0.1',
      port: 5173,
      // If 5173 is taken, Forge has already deleted `.vite`; failing here leaves no `main.js` and Electron shows "cannot find module".
      strictPort: false,
    },
    plugins: [vue(), pluginExposeRenderer(name)],
    resolve: {
      preserveSymlinks: true,
    },
    clearScreen: false,
  } as UserConfig;
});
