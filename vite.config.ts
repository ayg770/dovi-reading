import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the build works from any sub-path (e.g. GitHub Pages /repo-name/)
export default defineConfig({
  plugins: [react()],
  base: './',
})
