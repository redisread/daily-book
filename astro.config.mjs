// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://daily-book.jiahongw.com',
  output: 'server',
  adapter: cloudflare({
    configPath: process.env.CLOUDFLARE_CONFIG_PATH ?? 'wrangler.jsonc',
    imageService: 'compile',
  }),
  session: false,
  integrations: [sitemap()],
  server: {
    port: 5445,
  },
});
