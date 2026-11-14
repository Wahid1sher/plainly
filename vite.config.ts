import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: { firebase: ['firebase/app', 'firebase/ai', 'firebase/app-check', 'firebase/auth', 'firebase/firestore', 'firebase/remote-config'], react: ['react', 'react-dom'] },
      },
    },
  },
});
