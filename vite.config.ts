import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Politique de sécurité identique à celle de Nginx en production (testée avec « npm run preview »).
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src https://api.dropboxapi.com https://content.dropboxapi.com",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export default defineConfig({
  plugins: [svelte()],
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0, // aucun fichier en ligne : compatible avec la CSP stricte
  },
  server: { port: 5173, strictPort: true },
  preview: {
    port: 4173,
    strictPort: true,
    headers: { 'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer' },
  },
});
