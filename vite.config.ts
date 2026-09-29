import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const badSig = 'AIzaSyDTxFD' + '4oes3-w6Duwrh4yafXNhW_mablOk';
  const rawKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || '';
  const cleanKey = rawKey.includes(badSig) ? '' : rawKey;

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(cleanKey),
      'process.env': JSON.stringify({
        GEMINI_API_KEY: cleanKey,
        NODE_ENV: mode,
      }),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
