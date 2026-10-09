# Plán: Redesign ProjectsPage (/projects) – varianty k výběru

> Branch: `feat/projects` (nadstavba nad main). Bez zásahu do kódu, dokud uživatel nevybere variantu.

## Výchozí stav
- `packages/ui/src/pages/ProjectsPage.tsx` – seznam DT projektů + detail (grid, sort chips, grid-sheet, viewer s „Použít config"), paginace 50, bez URL stavu, bez search, bez loading/error stavů.
- Vedle: `CanvasProjectsPage` (`window.prompt/confirm`, hover-only akce), křehký match DT↔Canvas podle jména + port-1 URL hack.
- Slabiny: žádný deep-link, textové řádky bez coverů, grid bez virtualizace, mobilní použitelnost dialogů.

## Fáze 1 – návrhy (bez kódu, realizuje @designer)
1. @designer vypracuje **3 varianty** redesignu, každá: layout seznamu i detailu, navigace/stav v URL, search/sort/filtr, grid + viewer, sjednocení DT↔Canvas, mobilní chování. Vše v design stylu, nic nemazat z funkcí. Otevřené body sepíše jako otázky.
2. Uživatel vybere variantu (případně kombinaci).

## Fáze 2 – realizace vybrané varianty (po schválení)
- Implementace v `feat/projects` (packages/ui + napojení), tsc + buildy + průchod.
- Volitelně: backend drobnosti (cover náhledy, full-res image) – jen pokud varianta vyžaduje, po dalším schválení.

## Stav
- Vybráno uživatelem: varianta A (hub s taby), mobil jen badge, bez coverů (do backend thumbnailů).
- Vazba nezodpovězena → default localStorage mapa (vratné, bez backendu); URL query styl, search v názvech, paginace zachována, Canvas CRUD minimální (dle varianty A).
- Schváleno: Projects UI clean + minimalisticky + moderně (jen Projects). Zadá se @designerovi hned po doběhu mazání Canvasu.
- Hotovo (9a57a6b + 71ca5ae): CanvasPage smazána, routa /canvas/:id pryč, položka Canvas ze sidebaru pryč, /canvas seznam zůstal, canvasgen2 větve zachovány, tsc + buildy OK.
- Hotovo clean UI (15a3b56): jen vizuální zjednodušení ProjectsPage, funkce zachovány, tsc + buildy OK.
- Schváleno: viditelný reload (rotace, toast, error stav; server beze změny). Realizuje @designer.
- Hotovo join (dc83792): správné obrázky včetně 612-617, posun pryč, tsc OK.
- Samovolný abort generace: hotovo celé (6dff7d2 server + e7366d1 UI onAbort/Zkusit znovu). Ověřeno tsc + buildy.
- Hotovo stop-all.sh (d4f6c35): dev.ts zapisuje PID, stop-all cíleně zastavuje, ověřeno end-to-end.
