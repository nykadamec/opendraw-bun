# F6 frontend – evidence realizace (2026-09-05)

Zdroj (jen čtení): `../opendraw/frontend/src/` ve stavu k 19:12
(včetně mobilního redesignu, config panelu a search z nového kódu).
Staré repo nebylo modifikováno (ověřeno `git status` + mtime).

## Co vzniklo

| Cíl (opendraw-bun) | Zdroj | Poznámka |
|---|---|---|
| `packages/config-theme/src/ThemeContext.tsx` | `shared/ThemeContext.tsx` | 1:1, beze změny |
| `packages/config-theme/src/tokens.css` | `:root` + `[data-theme=light]` z `src/index.css` | tokeny vytažené zvlášť |
| `packages/config-theme/src/index.css` | zbytek `src/index.css` | převedeno na Tailwind v4 (`@import "tailwindcss"` + `@theme inline`), vzhled 1:1 |
| `packages/config-theme/src/vite-base.ts` | nové | 1 sdílený vite základ (`createBaseAppConfig`, MODE desktop\|mobile) |
| `packages/ui/src/components/*` (8 souborů) | `shared/components/*` | 1:1, jen přemapované importy |
| `packages/ui/src/pages/*` (7 souborů) | `shared/pages/*` | 1:1, jen přemapované importy |
| `packages/ui/src/hooks/useFeatureFlag.ts` | `shared/hooks/*` | 1:1 |
| `packages/ui/src/{samplers,seedModes,upscalers,lora-utils}.ts` | `shared/*` | 1:1 |
| `packages/api-client/src/index.ts` | nové | re-export client + types ("jen napoj") |
| `apps/desktop/src/{App,main}.tsx` | `src/web/App.tsx` + `index.tsx` | bez redirect hacku (5173→5174 pryč, plán), importy z `@opendraw/ui` / `@opendraw/config-theme` |
| `apps/mobile/src/{App,main}.tsx` | `src/mobile/App.tsx` + `index.tsx` | importy z `@opendraw/ui` / `@opendraw/config-theme` |
| `apps/{desktop,mobile}/index.html` | `src/web/index.html`, `src/mobile/index.html` | 1 společná šablona, 2 instance (mobile: viewport-fit + theme-color script) |
| `apps/{desktop,mobile}/vite.config.ts` | nové | jen volání `createBaseAppConfig` s vlastním MODE (port 5173 / 5174) |

Přemapování importů v `packages/ui`: `../api/client` → `@opendraw/api-client`,
`../types` → `@opendraw/api-client`, `../ThemeContext` → `@opendraw/config-theme`.

## Vědomé odchylky od starého kódu

- **reicon-react 1.2.5**: `ClipboardImport2` → `ClipboardImport`, `ClipboardExport2` → `ClipboardExport`
  (upstream přejmenoval ikony; opraveno v `PromptCard.tsx`, `GeneratePage.tsx`). Stejná ikona, stejné místo.
- **api-client**: opraven relativní import `../types` → `./types` (pozůstatek F0 kopie ze `shared/api/`).
- **Tailwind v3 → v4**: `tailwind.config.ts` nahrazen CSS-first `@theme inline` (utility `bg-canvas`, `text-txt-*` atd. čtou CSS proměnné za běhu, přepínání tématu beze změny).
- **react** přidán do `dependencies` `@opendraw/config-theme` (ThemeContext je runtime závislost).

## Ověření

- `tsc --noEmit`: api-client, config-theme, ui, desktop, mobile – vše exit 0.
- `bun --filter @opendraw/desktop build` – OK (dist/index.html + assets, ~602 KB JS; chunk-size warning je jen varování).
- `bun --filter @opendraw/mobile build` – OK (~538 KB JS).
- Preview servery + curl: desktop 7/7 rout 200 (`/`, `/gallery`, `/projects`, `/loras`, `/settings`, `/canvas`, `/canvas/abc`), mobile 5/5 rout 200 (`/`, `/gallery`, `/projects`, `/loras`, `/settings`), všude SPA shell s `#root`.
- Design: komponenty i stránky jsou port 1:1 včetně `data-el-name` atributů, mobilního tabbaru, config panelu (ParamSheet) a search.
