// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://daily-book.redisread.workers.dev',
  integrations: [sitemap()],
  server: {
    port: 5445,
  },
});
