# Návrhy redesignu ProjectsPage – 3 varianty od @designera (bez kódu)

Společné: design styl zachován, žádná funkce se nemaže, `window.prompt/confirm` pryč, konec matchování DT↔Canvas podle jména (explicitní vazba `linkedCanvasId` + UI „Propojit canvas"), konec port-1 hacku (interní navigace / badge na mobilu).

## Varianta A – Sjednocený hub s taby (nejmenší změna, doporučená)
Jedna stránka `/projects`, přepínač `Vše | DT | Canvas` + search + sort chips. Řádky s covery (56px thumb), badge Canvas, filtr propojenosti. Detail DT + sekce „Propojený canvas". URL v query (`?tab&q&sort&project&page&entry&cols&aspect`), viewer přes `entry`. Mobil: sticky taby+search, sheet pro propojení.

## Varianta B – Split master-detail (desktop síla, mobil stack)
Desktop dvousloupec (seznam 320–380px + detail), mobil drill-down se stejnou URL. Nested routes (`/projects/dt/:id`, `/projects/canvas/:id`). Cover karty, tečka „má canvas", Canvas akce jako tlačítka. Větší zásah do routingu.

## Varianta C – Galerie projektů (vizuální, karty s covery)
Mřížka karet DT i Canvas s covery, sekce Propojené dvojice / Nepřiřazené / Samostatné, view-toggle Karty|Řádky, hero-pruh v detailu. Nejhezčí na mobilu, ale vyžaduje cover endpoint (jinak pomalé).

## Otevřené otázky (z návrhu)
1. Varianta A / B / C / kombinace?
2. Mobil: otevřít Canvas, nebo badge „jen desktop"?
3. Vazba: localStorage mapa, nebo backend pole?
4. Covery: plný image endpoint, nebo bez coverů do backend úpravy?
5. URL: query styl, nebo nested routes?
6. Search: jen názvy, nebo i prompty?
7. Paginace vs infinite scroll, limit 50?
8. Canvas CRUD rozsah na /projects?

Zdroj: @designer ses_f8d341ffbffepJnUKUZFiQ0LZA.
