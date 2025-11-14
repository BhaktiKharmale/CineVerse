import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    historyApiFallback: true, // Enable SPA fallback for deep links
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined, // Prevent chunk splitting issues
      },
    },
  },
});
