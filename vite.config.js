import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /<repo>/, not the domain root; without
  // this base every asset URL in the built index.html would 404 there.
  base: '/TimelineOfEverything/',
  plugins: [react()],
})
