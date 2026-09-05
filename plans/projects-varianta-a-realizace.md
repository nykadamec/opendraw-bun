# Realizace varianty A – hub /projects (feat/projects)

Datum: 2026-09-05. Zdroj návrhu: plans/projects-navrhy-design.md, schválená varianta A.

## Co je hotovo
- `packages/ui/src/pages/ProjectsPage.tsx` — přepsáno na sjednocený hub:
  - Taby Vše | DT | Canvas + search (debounce 300 ms, jen názvy) + sort chips (Datum/Velikost/Obrázky/Název) + filtr vazby (Vše/Propojené/Bez vazby).
  - Řádky BEZ coverů (jen text: ikona, název, počty, datum, badže DT/Canvas + ↔ vazba).
  - Vazba localStorage `projects.links` (dtId→canvasId) + UI Propojit (sheet se seznamem canvasů) / Rozpojit (tlačítko, bez confirmu). Konec matchování podle jména.
  - URL query styl: `?tab&q&sort&project&page&entry&cols&aspect`; viewer přes `?entry=`; stránkování „Načíst další (x/y)", limit 50.
  - Canvas CRUD na hubu (Nový canvas / přejmenovat / smazat) přes modální dialogy — žádné `window.prompt/confirm`.
  - Port-1 hack pryč: desktop interně `navigate('/canvas/:id')`; mobil (`allowCanvasOpen={false}`) ukazuje badge/sheet „Canvas je na desktopu".
  - Sticky hlavička (taby+search) funguje i na mobilu; design třídy (glass-panel, bg-surface, rounded-2xl…) zachovány.
  - Prop `allowCanvasOpen` (default true = desktop).
- `packages/ui/src/pages/CanvasProjectsPage.tsx` — odstraněny `window.prompt/confirm`, nahrazeny modaly Vytvořit/Přejmenovat/Smazat (funkce zachovány, dvojklik → přejmenování zachován).
- `apps/mobile/src/App.tsx` — `/projects` s `allowCanvasOpen={false}`; žádné canvas routy v mobilu (beze změny). Desktop App beze změny.

## Ověření
- `bunx tsc --noEmit` pro ui, desktop i mobile: OK.
- `bun run build` (ui → backend → web): desktop + mobile OK.
- API smoke (read-only): `/api/health`, `/api/projects`, `/api/canvas`, entries `?page=1&limit=50` a entry config: OK.
- Statický průchod: seznam/taby/search/sort/filtr, detail `?project=`, viewer `?entry=`, propojení/rozpojení, modály, badge na mobilu.

## Poznámka
- `GalleryPage.tsx` stále obsahuje jeden `window.confirm` — mimo rozsah varianty A (galerie), ponecháno záměrně.
