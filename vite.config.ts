import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: '/Portfolio/', // путь к репозиторию на GH Pages
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'), // для удобного импорта
      },
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
  };
});
