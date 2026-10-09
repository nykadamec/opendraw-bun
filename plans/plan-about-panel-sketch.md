# Plán – About panel mockup pro opendraw-bun (Sketch MCP)

- Zdroj požadavku: uživatele chtěl mockup About panelu přes Sketch MCP s analýzou projektu.
- Datum: 2026-09-07
- Pracovní adresář: /Users/nykadamec/Documents/New project/projects/opendraw-bun

## Cíl
Vytvořit mockup About panelu pro opendraw-bun pomocí Sketch MCP.

## Kroky
1. Analýza projektu (delegováno @explorer):
   - struktura apps/* + packages/*, kde je About panel (pokud existuje)
   - UI stack, design systém, téma, existující komponenty pro About
   - jak se používá Sketch / sketch MCP v projektu (pokud vůbec)
2. Návrh + realizace mockupu (delegováno @designer):
   - navrhnout layout, hierarchii, spacing, responsive chování About panelu
   - realizovat přes Sketch MCP (tools.sketch.run_code)
   - copy neřešit do detailu (@designer slabý copywriting, doladím po něm)
3. Ověření:
   - zkontrolovat výstup mockupu, sladit s design systémem projektu
   - copy review bez zásahu do vizuálu

## Mimo rozsah
- Neimplementovat finální produkční About panel do apps/desktop|mobile ani packages/ui, dokud uživatel neschválí mockup.
- Neediltovat generované protocol soubory, neměnit publicDir / Tailwind @source.
- Žádná live generace modelů.

## Stav
- [x] Plán uložen
- [x] Analýza @explorer hotová
- [x] UI styl ověřen přes portal + @observer
- [x] Mockup @designer hotový: about-panel-mockup.sketch (About Panel, 4 artboardy)
- [ ] Čeká schválení + případný převod do packages/ui
- [ ] Ověření + předání
