import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: ['j7-fitness-3d-website-production.up.railway.app']
  }
})
