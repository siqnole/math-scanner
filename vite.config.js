import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Multi-page app: one Vite server, two entry points
// Control window: http://localhost:5173/src/control/index.html
// Overlay window: http://localhost:5173/src/overlay/index.html
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        control: resolve(__dirname, 'src/control/index.html'),
        overlay: resolve(__dirname, 'src/overlay/index.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
})
