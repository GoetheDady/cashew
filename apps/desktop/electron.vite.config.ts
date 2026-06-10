import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    plugins: [
      // 外部化 node_modules 依赖，但打包 workspace 内部包
      externalizeDepsPlugin({
        exclude: ['@cashew/agent', '@cashew/shared'],
      }),
    ],
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@cashew/shared'],
      }),
    ],
  },
  renderer: {
    plugins: [react(), tailwindcss()],
  },
});
