
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Option A: Allow ALL ngrok domains dynamically (Recommended)
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app'],
    
    // OR Option B: Allow everything for dev local testing
    // allowedHosts: true,
  }
})