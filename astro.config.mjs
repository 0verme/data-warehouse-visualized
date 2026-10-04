import process from 'node:process'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

export default defineConfig({
  integrations: [
    react(),
    // Stage 0 隐藏 harness（#35）不进入 sitemap；`filter` 只排除 `/dev/` 下的实验页面。
    sitemap({ filter: (page) => !page.includes('/dev/') }),
  ],
  output: 'static',
  site: 'https://sql.sb',
  base: process.env.BASE_PATH ?? '/',
})
