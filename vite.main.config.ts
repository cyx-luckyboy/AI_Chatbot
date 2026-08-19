import type { ConfigEnv, UserConfig } from 'vite';
import path from 'node:path';
import { defineConfig, mergeConfig } from 'vite';
import { getBuildConfig, getBuildDefine, external, pluginHotRestart } from './vite.base.config';

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<'build'>;
  const { forgeConfigSelf } = forgeEnv;
  const define = getBuildDefine(forgeEnv);
  const config: UserConfig = {
    build: {
      /** pdf-parse 内部 `require(\`./pdf.js/${version}/build/pdf.js\`)`，须参与预分析才能打进单文件 */
      commonjsOptions: {
        dynamicRequireTargets: ['node_modules/pdf-parse/lib/pdf.js/**/build/pdf.js'],
      },
      lib: {
        entry: forgeConfigSelf.entry!,
        fileName: () => '[name].js',
        formats: ['cjs'],
      },
      rollupOptions: {
        external,
      },
    },
    plugins: [pluginHotRestart('restart')],
    define,
    resolve: {
      // Load the Node.js entry.
      mainFields: ['module', 'jsnext:main', 'jsnext'],
      alias: {
        /** ws 打包进主进程时 optional require 会被静态解析，须指向 JS stub */
        bufferutil: path.resolve(__dirname, 'src/shared/stubs/bufferutil-stub.cjs'),
        'utf-8-validate': path.resolve(__dirname, 'src/shared/stubs/utf-8-validate-stub.cjs'),
      },
    },
  };

  return mergeConfig(getBuildConfig(forgeEnv), config);
});
