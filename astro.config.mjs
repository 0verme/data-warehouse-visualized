import process from 'node:process'
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

export default defineConfig({
  integrations: [react()],
  output: 'static',
  base: process.env.BASE_PATH ?? '/',
})
