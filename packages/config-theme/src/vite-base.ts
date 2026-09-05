import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export type AppMode = 'desktop' | 'mobile';

export interface BaseAppOptions {
  /** MODE desktop|mobile – vybírá port, outDir a titulek */
  mode: AppMode;
  port: number;
  outDir: string;
  /** Kam míří /api proxy v devu (default: lokální server) */
  apiTarget?: string;
}

/**
 * Jeden sdílený vite základ pro obě aplikace.
 * apps/desktop a apps/mobile ho volají jen s vlastním MODE.
 *
 * PWA assets (manifest.webmanifest + icons/) žijí JEDNOU v
 * `packages/config-theme/public/` – `publicDir` míří na tento sdílený
 * adresář (odvozeno z import.meta.url, žádné absolutní cesty).
 * Obě index.html odkazují stejný `/manifest.webmanifest`.
 */
export function createBaseAppConfig({
  mode,
  port,
  outDir,
  apiTarget = 'http://localhost:3001',
}: BaseAppOptions) {
  return defineConfig({
    define: {
      'import.meta.env.APP_MODE': JSON.stringify(mode),
    },
    // Sdílený public dir – jeden manifest + ikony pro desktop i mobile.
    // realpathSync: balíček se do aplikací linkuje přes workspace symlink
    // (apps/*/node_modules/@opendraw/config-theme), bez dereference by
    // ../../public mířilo do node_modules a vite by public tiše přeskočil.
    publicDir: resolve(dirname(realpathSync(fileURLToPath(import.meta.url))), '../public'),
    optimizeDeps: {
      include: ['reicon-react', 'reicon-react/icons/PuzzlePiece'],
    },
    plugins: [react(), tailwindcss()],
    build: {
      outDir,
      emptyOutDir: true,
    },
    server: {
      port,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          // Dlouhé SSE streamy generování (minuty, tiché fáze) – výchozí
          // proxy timeout (~2 min) by je samovolně abortoval.
          timeout: 10 * 60 * 1000,
          proxyTimeout: 10 * 60 * 1000,
        },
      },
    },
  });
}
