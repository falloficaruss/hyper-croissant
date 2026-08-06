import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: new URL('./index.html', import.meta.url).pathname,
        docs: new URL('./docs.html', import.meta.url).pathname,
        download: new URL('./download.html', import.meta.url).pathname,
        about: new URL('./about.html', import.meta.url).pathname,
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});

