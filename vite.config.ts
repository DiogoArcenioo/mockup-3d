import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [{
    name: 'forma-monochrome-brand',
    generateBundle(_options, bundle) {
      // Keep the UI monochrome while preserving the semantic low-stock warning.
      for (const item of Object.values(bundle)) if (item.type === 'asset' && item.fileName.endsWith('.css')) {
        item.source = String(item.source).replace(/\.f-low\s*\{[^}]*\}|#([\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\da-f])/gi, (match, hex: string | undefined) => {
          if (!hex) return match;
          const expanded = hex.length < 5 ? [...hex].map(c => c + c).join('') : hex;
          const gray = Math.round(.2126 * parseInt(expanded.slice(0,2),16) + .7152 * parseInt(expanded.slice(2,4),16) + .0722 * parseInt(expanded.slice(4,6),16)).toString(16).padStart(2,'0');
          return '#' + gray.repeat(3) + expanded.slice(6);
        });
      }
    },
  }],
  base: '/legacy/',
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001' } },
  preview: { port: 4173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001' } },
  build: { target: 'es2022' },
});
