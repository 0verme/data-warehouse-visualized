import process from 'node:process'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

export default defineConfig({
  integrations: [react(), sitemap()],
  output: 'static',
  site: 'https://sql.sb',
  base: process.env.BASE_PATH ?? '/',
})
