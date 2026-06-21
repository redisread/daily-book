// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://daily-book.jiahongw.com',
  integrations: [sitemap()],
  server: {
    port: 5445,
  },
});
