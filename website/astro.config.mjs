import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://VahidAlizadeh.github.io',
  base: '/NexQ/',
  output: 'static',
  integrations: [react(), tailwind()],
});
