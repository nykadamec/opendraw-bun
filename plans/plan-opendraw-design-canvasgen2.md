# Plán – openDraw.pen + design localhost:5173 s CanvasGen 2.0 = true

Datum: 2026-09-07
Workspace: /Users/nykadamec/Documents/New project/projects/opendraw-bun

## Cíl
- Ověřit `openDraw.pen` na `/Users/nykadamec/Documents/openDraw.pen` (315 B, prázdný Frame 800x600, v2.17)
- Udělat design pro `http://localhost:5173/` (desktop Vite, port 5173, proxy /api → :3001)
- S `CanvasGen 2.0` zapnutým (flag `canvasgen2`, localStorage `opendraw.feature.canvasgen2`, default false)

## Zjištěné soubory
- Flag definice: `packages/ui/src/hooks/useFeatureFlag.ts:5`
- Settings UI: `packages/ui/src/pages/SettingsPage.tsx:173,432` (ToggleRow "CanvasGen 2.0")
- Konzumenti: `apps/desktop/src/App.tsx:138` (layout switch), `packages/ui/src/pages/GeneratePage.tsx:508,1314-1315` (DesktopLayout/CanvasContainer switch)
- Canvas stránka: `packages/ui/src/pages/CanvasProjectsPage.tsx:95` (`/canvas`)
- Entry: `apps/desktop/src/main.tsx:1-13`, `apps/desktop/src/App.tsx:186-192`, `apps/desktop/vite.config.ts:3-6`, `packages/config-theme/src/vite-base.ts:32,53-55`
- Server :5173 běží (PID 93792, curl 200)

## Lanes
1. [hotovo] @explorer – locate pen + flag + :5173 (ses_f82f8f5b4ffegnBimiOFeEj92k)
2. [právě běží] @designer – navrhnout a implementovat UI/UX pro desktop s canvasgen2=true, ověřit na :5173
   - scope: pouze `packages/ui/src/pages/*`, `apps/desktop/src/App.tsx`, theme tokeny, žádné backend změny
   - flag pro ověření nastavit v prohlížeči: `localStorage.setItem('opendraw.feature.canvasgen2','true')`, ne měnit default v kódu trvale pokud to nedává smysl
   - `.pen` je šifrovaný, číst jen přes pencil MCP, needitovat binárně
3. [čeká] orchestrátor – copy review po designerovi, ověření `bun dev` / curl :5173, reconciliace

## Pravidla
- Dodržovat plán, neimplementovat nic mimo schválené soubory
- Design vlastní @designer, copy doladí orchestrátor bez změny vizuálu

## Doplnění 19:59 – práce přes pencil MCP (na žádost)
- `openDraw.pen` ověřen: `/Users/nykadamec/Documents/openDraw.pen`, prázdný Frame 800x600 #FFF, otevřen v Pen.app přes `open`
- `http://localhost:5173/` ověřen: HTTP 200, desktop Vite běží
- Požadavek: designovat obsah localhost:5173 do openDraw.pen přes pencil MCP, s `CanvasGen 2.0` = true
- Flag pro test: v prohlížeči `localStorage.setItem('opendraw.feature.canvasgen2','true')` + reload (default v kódu false – neměnit trvale bez schválení)
- Pencil MCP `pencil` je `connected`, Pen.app 1.2.8 běží, `.pen` číst jen přes pencil MCP (`get_app_state`, `read_skill`), ne binárně
- Lane 2 upravena: @designer má použít pencil MCP (get_app_state + SKILL.md), ne jen edit kódu

## Doplnění – mockup "about panel" podle REF (hotovo)
- Požadavek: podle "REF - localhost 5173 CanvasGen2" (bHbM8) udělat mockup "about panel"
- Provedl @designer přes pencil MCP, kód projektu nesahal
- Nový frame: `About panel`, ID `Rn2PO`, x 3874.67 / y 0 vedle REF, šířka 480, fit_content cca 760, clip true
- Tokeny dle REF: bg #0B0B0C, surface #111113, surface-el #1A1A1E, border #26262B, accent #22C55E, text #F5F4F0/#A7A7B0/#6E6E78, Inter, radius 20/16/12, padding/gap 16
- Obsah: hlavička OpenDraw + CanvasGen 2.0 + badge v2.0.4, perex česky, Stav připojení (Draw Things Připojeno, TLS OK, 127.0.0.1:7859, 38 ms, 12 modelů, tlačítka Zkontrolovat připojení + Nastavení), Verze a prostředí (2.0.4, canvasgen2, localhost:5173 → :3001), Užitečné odkazy (3 řádky s ikonami), patička + Zavřít
- Ověřeno: TakeScreenshot Rn2PO 2x, c.problems prázdné, app state /Users/nykadamec/Documents/openDraw.pen otevřen, REF bHbM8 vybraný

## Doplnění – redesign "Configuration Panel (sidebar right)" (zadáno)
- Požadavek: redesign mockup pro pravý sidebar Configuration Panel, navázat na REF (bHbM8) a About panel (Rn2PO)
- Tokeny a čeština dle REF, žádné lorem, kód projektu nesahat, jen .pen přes pencil MCP

## Doplnění – redesign "Configuration Panel (sidebar right)" (hotovo)
- Nový frame: `Configuration Panel - Redesign`, ID `SfhhN`, x 4938 y 0 vedle FYNyF, šířka 384, clip true, tokeny $bg/$surface/$surface-el/$border/accent, Inter, radius 20/16/14/12, gap/padding 16
- Sekce: hlavička Konfigurace + reset/zavřít, stav Draw Things Připojeno, Model krea_2_turbo_q8, LoRA 4 aktivní (Selfie realism 0,8 / Detail slider 0,6 + Přidat styl), Rozměr (1:1 / 2:3 Large aktivní / 16:9), Kvalita Steps 8 + CFG 1,0, Seed 482091 + kostka, Generovat (accent) + Kopie nastavení / Do fronty, patička lokální běh
- Oprava ikony: clock → history (není v lucide)
- Ověřeno: TakeScreenshot SfhhN prošel, Get problems []

## Doplnění – ověření úplnosti Redesign vs originál (zadáno)
- Otázka: obsahuje "Configuration Panel - Redesign" (SfhhN) vše z "Configuration Panel (sidebar right)"?
- Lane: @designer přes pencil MCP porovná obsah obou framů
- Pokus 1 (ses_f82cb6250ffek71j1nFK4ScTdR) zrušen, pokus 2 (ses_f82c93247ffeKExOYaPkXdLhz2) selhal: Pencil MCP transport not connected (visual_studio_code), nenačetl bHbM8/SfhhN, nic neměnil
- Příčina: v `opencode mcp list` je pencil connected, Pen.app běží a má otevřený /Users/nykadamec/Documents/openDraw.pen, ale běžící mcp-server procesy jsou `--app visual_studio_code` (PID 1566,1562, socket pencil-visual_studio_code.sock), ne `--app desktop --agent openCodeCLI` dle ~/.config/opencode/opencode.json. Designer se připojil přes visual_studio_code transport, který na desktop okno nedosáhne
- Pokus 3 (ses_f82c6799affeBtfz4Nx4DUuxBZ) selhal stejně: read_skill/get_app_state visual_studio_code transport not connected, execute Connection closed, nic neměněno
- Pokus 4 (ses_f82c07688ffeyECh6JJl0I62bY) úspěšný přes app desktop: aktivní /Users/nykadamec/Documents/openDraw.pen, bHbM8=REF, SfhhN=Redesign, čteno přes execute+Get+Print
- VERDIKT: NE – Redesign neobsahuje vše. Chybí: výběr/přepínání modelu (150+ cloud + lokální list, hledání, .ckpt název), 2 ze 4 LoRA (badge 4 vs 2 viditelné), Shift 4.5 + sampler unipc_trailing, zámek seedu, prompt + negative prompt, sekce ZÁKLAD/ROZŠÍŘENÍ, Pokročilé/Upscaler/Refiner/Hires Fix. Zachováno: Rozměr, Steps/CFG základ, Seed funkčně, Generovat vylepšeno. Navíc: popisky, slidery, kostka, Kopie nastavení/Do fronty, patička, Draw Things status + hlavička s reset/zavřít (v REF nic)

## Doplnění – doplnit chybějící do Redesignu (zadáno)
- Požadavek: doplnit do SfhhN vše co chybí dle diffu, zachovat tokeny a češtinu, kód nesahat, jen .pen přes pencil MCP app desktop
- Hotovo (ses_f82bd8a25ffepx3FYnA3xPuVQG): Model plný krea_2_turbo_q8p.ckpt + Hledat + LOKÁLNÍ 7 (check + 3 vzory + další 3) + CLOUD 150+ (3 vzory + ~147), LoRA 4/4 (Selfie 0,8 + Detail 0,6 + Maria star char 0,7 + BB size 0,5 + hint vazby na prompt), Pokročilé sbaleno (Shift 4,5 + Sampler unipc_trailing + Upscaler/Refiner/Hires Fix Vypnuto), Seed 482091 + zámek lock vedle kostky, TakeScreenshot + problems []

## Doplnění – porovnat Actual vs AppWeb (zadáno)
- Požadavek: v openDraw.lib.pen porovnat frame "Actual" (stav po změně sidebaru) vs "AppWeb" (cílový vzhled)
- Lane: @designer přes pencil MCP app desktop, read-only
- Pokus 1 (ses_f8200e23dffeKY61toApaMZgHV) selhal: v Pen nebyl nic otevřeno (Failed to access file), nic neměněno
- Oprava: openDraw.lib.pen (939 kB) otevřen přes `open`, renderer hlásí fileURI openDraw.lib.pen – opakuji diff
- Pokus 2 (ses_f81fff920ffeGaCyK0APl1b4UI) úspěšný: Actual=fXoez vs AppWeb=o7424n. ROZDÍLY: Actual 3-sloupcový (aside 240×1029 + toggle + main, x16 y16, stroke #ffffff14, brand popisek, Skrýt panel footer, externí toggle 32×64, duplicitní vnořený aside) vs AppWeb 1-sloupcový overlay (bez height/padding/stroke, bez popisku/footeru/togglu, x27.99 y27.78, aktivní položka má navíc disabled stroke+blur, ikony lucide vs surové svg, brand text auto vs fill_container). CO DOROVNAT: height aside/nav/položek/LogoButton, stroke+padding aside, brand popisek + gap, footer + toggle (nebo vědomě vynechat), x16 y16 rotace 0, sjednotit ikony na lucide, odstranit disabled stroke z aktivní (nebo přidat do Actual), smazat duplicitu X1FyF, tokeny zatím držet hardkódy

## Doplnění – sidebar podle AppWeb (upřesněno, branch feat/opendraw_v2/sidebar)
- "Actual" (fXoez) = momentální kód z feat/opendraw_v2/sidebar. Cíl: sidebar v kódu má vypadat jako "AppWeb" (o7424n)
- Spec z diffu: overlay 1 sloupec, aside bez fix height/padding/stroke, brand bez popisku, bez footeru Skrýt panel, bez externího togglu, aktivní položka bez disabled stroke+bluru, ikony lucide, pozice 16/16 bez rotace
- Lane: @designer, scope: packages/ui/src/components/DesktopSidebar.tsx + apps/desktop/src/App.tsx použití + packages/config-theme css po něm
- Hotovo (ses_f81fcfc92ffe7c6EVMb7eLfNzo): DesktopSidebar zjednodušen na čistý overlay (pryč visible/peek/toggle/hover zóna/footer/ouško/Cmd+B/Escape, jediný <DesktopSidebar/> bez props), aside bez height/padding/stroke, ikony PenTool/Sparkles/Image/Folder/Puzzle/Settings, aktivní bez disabled stroke/bluru. App.tsx -192 řádků (stav sidebarVisible odstraněn, grep nic jiného neužívá). index.css: .sidebar-panel bez borderu, .sidebar-edge-tab smazán. Ověřeno: tsc ui+theme 0, curl :5173 200, 0 výskytů toggle symbolů (potvrzeno i orchestrátorem), routes beze změny

## Doplnění – LogoButton ikona jako Logo mark (zadáno)
- Požadavek: svg ikona v LogoButtonu přesně jako "Logo mark" (pen-tool, luH5w) z AppWeb (o7424n) v openDraw.lib.pen
- Lane: @designer, scope: jen brand ikona v packages/ui/src/components/DesktopSidebar.tsx
- Hotovo (ses_f81f93c76ffe51BjF7Zr79VrFd): PenTool → inline svg s přesným Logo mark path (viewBox 0 0 13.9999 14, fill #111), import uklizen, nic jiného neměněno. Ověřeno: tsc ui 0 (potvrzeno i orchestrátorem), curl :5173 200

## Doplnění – sidebar offset 28px + LogoButton padding 10px (zadáno)
- Požadavek: DesktopSidebar 28px od levého i horního kraje (teď 16px), LogoButton vnitřní padding 10px ze všech stran (teď 8px/14px)
- Lane: @designer, scope: packages/ui/src/components/DesktopSidebar.tsx (+ App.tsx jen pokud offset ovlivňuje layout main)
- Hotovo (ses_f81f1fb6fffexK2A32o1qRaVGH): aside left-4/top-4 → left-[28px]/top-[28px] + h-[calc(100vh-56px)], LogoButton p-[8px_14px] → p-[10px], App.tsx nesaháno. Ověřeno: tsc ui 0, :5173 i :3001/health 200 (potvrzeno i orchestrátorem grep ř.58/136)

## Doplnění – výška sidebaru podle obsahu (zadáno)
- Problém: h-[calc(100vh-56px)] neodpovídá – AppWeb má aside BEZ fix výšky, výška podle obsahu
- Požadavek: odstranit fixní výšku, aside h-fit
- Lane: @designer, scope: jen aside třída v DesktopSidebar.tsx
- Hotovo (ses_f81f1083bffe3fzUEH3KsP0kYO): h-[calc(100vh-56px)] → h-fit + overflow-visible, pozice a zbytek ponechány. Ověřeno: tsc ui 0, :5173 200 (potvrzeno grep ř.136)

## Doplnění – LogoButton 2 stavy + toggle sidebaru (zadáno)
- active (sidebar viditelný): bílé pozadí jako teď; no-active (sidebar skrytý + bez hoveru): background rgba(255,255,255,0.2); sidebar skrytý + hover na buttonu: vzhled active
- Klik na LogoButton přepíná viditelnost sidebaru (nav se schová/ukáže, LogoButton zůstává vždy)
- Lane: @designer, scope: DesktopSidebar.tsx (+ App.tsx jen pokud potřeba)
- Hotovo (ses_f81ea1457ffeedrXQYapjGThfS): LogoButton je <button> toggle (aria-expanded, title), stav visible v useState + localStorage opendraw.sidebarVisible default true; visible → bg-white, skrytý → bg-[rgba(255,255,255,0.2)] hover:bg-white čistě CSS; nav se při skrytí nerenderuje, App.tsx nesaháno. Ověřeno: tsc ui 0 (potvrzeno i orchestrátorem), :5173 200

## Doplnění – fluid animace skrytí/zobrazení (zadáno)
- Požadavek: moderní plynulá animace pro skrývání a zobrazování sidebaru
- Lane: @designer, scope: DesktopSidebar.tsx (+ theme css pokud potřeba)
- Hotovo (ses_f81e5c8d5ffewSOU0M7BxOzxWp): grid-rows collapse (1fr→0fr + opacity + translateY, 360ms cubic-bezier(0.22,1,0.36,1), zavřený visibility hidden + inert, reduced-motion vypíná). Ověřeno: tsc ui+theme 0 (potvrzeno i orchestrátorem), :5173 200

## Doplnění – animační knihovna (hotovo)
- Výzkum @librarian (ses_f81e47045ffeRzZtNvqHmm42Y6): top motion (doporučeno) > auto-animate > gsap > react-spring > tw-animate-css
- Volba: motion. Nainstalováno `bun add motion` do packages/ui (@opendraw/ui) → motion@13.2.0, lockfile uložen, tsc ui OK

## Doplnění – sidebar animace na motion (zadáno)
- Požadavek: přepsat ruční grid-rows collapse na motion (spring + AnimatePresence)
- Lane: @designer, scope: DesktopSidebar.tsx (+ theme css úklid starých tříd)
- Hotovo (ses_f81e0d5b7ffe7vNvNHCuGd64g5): AnimatePresence initial={false} + motion.nav (spring 300/30, reduced-motion → duration 0), staré .sidebar-nav-anim třídy smazány (0 výskytů), App.tsx nesaháno. Ověřeno: tsc ui+theme 0 + :5173 200 (potvrzeno i orchestrátorem)

## Doplnění – animace nehraje při togglu (hlášeno)
- Symptom: klik na LogoButton nav ukáže/schová, ale bez animace
- Podezření: zapnuté OS reduced-motion (→ duration 0), nebo AnimatePresence exit nehraje
- Lane: @designer audit + harden motion animace
- Direktiv uživatele (během auditu): animace se zobrazují BEZ OHLEDU na OS "Omezit pohyb" – useReducedMotion/duration 0 odstranit, spring vždy
- Audit ses_f81d16b35ffelORoU3bZosLncW zrušen před doručením – znovu zadáno jako spojený úkol (audit + vždy animovat)
- Hotovo (ses_f81cf69a8ffe7vNvNHCuGd64g5): příčina = chybějící key na motion.nav (AnimatePresence neuměl exit tracking) + duration-0 větev; oprava: key="sidebar-nav", useReducedMotion odstraněn (vždy spring 300/30), theme css netřeba. Ověřeno: tsc ui 0 + :5173 200 (potvrzeno i orchestrátorem, grep ř.185)

## Doplnění – LogoButton transition normal↔hover (zadáno)
- Požadavek: plynulá transition animace pozadí LogoButtonu mezi normal a hover stavem
- Lane: @designer, scope: jen LogoButton třídy v DesktopSidebar.tsx
- Hotovo (ses_f81cc5e4dffe0MsH5gv00EYRn3): transition-colors duration-150 → duration-200 ease-out (ř.70). Ověřeno: tsc ui 0 (potvrzeno i orchestrátorem)
- LogoButton no-active bg 0.2 → 0.4 (přímo, bez delegace – jedn řádek)

## Commit + branch galleryPage (hotovo)
- Commit 274dce7 na feat/opendraw_v2/sidebar (8 souborů: sidebar, App, theme, motion dep, font)
- Nová branch feat/opendraw_v2/galleryPage

## Doplnění – GalleryPage dle pencil (zadáno)
- Požadavek: GalleryPage v kódu podle pencil framu "GalleryPage" z openDraw.lib.pen
- Lane: @designer (pencil MCP app desktop + implementace UI)
- Hotovo (ses_f81b69147ffekgxb0fEd2pQSMb): frame tU5sc. Přepsán jen GalleryPage.tsx (+467/-233). Ověřeno: tsc ui 0, /gallery 200

## Doplnění – gallery kontejner 80 % centrovaný (zadáno)
- Požadavek: div `px-3 pb-10 pt-3 sm:px-4` → max-width 80 %, margin 0 auto
- Lane: @designer, scope: jen GalleryPage.tsx
- Hotovo (ses_f81aa8a7fffeq4cZ95bEKNtZh6): ř.342 mx-auto max-w-[80%] (potvrzeno grep), tsc ui 0, /gallery 200

## Doplnění – EPERM project-browser listProjects (zadáno)
- Chyba: `cannot read documents dir: EPERM: scandir '/Users/nykadamec/Library/Containers/com.liuliu.draw-things/Data/Documents'`
- Lane: @fixer, scope: apps/server project-browser (graceful fallback, žádný zápis do DT)
- Hotovo (ses_f81a9e056ffeKAu4mSD6xXFZea): isAccessDeniedError + getDocumentsStatus, EPERM → warn 1× + [], reset po obnovení; /api/projects 200 + X-Projects-Warning, entries EPERM → 404. Ověřeno: tsc server 0, reálná EPERM cesta → [] bez spamu (potvrzeno i orchestrátorem, 2 soubory +70/-2)

## Doplnění – Shell log: 16kanálové preview (analýza hotova)
- Symptom (maestri Shell): `preview decode error: Unsupported tensor channel count: 16` opakovaně, živé náhledy v UI nechodí, finální obrázek OK
- Příčina: DT streamuje preview jako 16kanálové latenty, decodeDtTensorToPng (dt-tensor.ts:73) umí 1/3/4; chyba se jen loguje (generate.ts:305), generování doběhne
- Volba: Prozkoumat DT API (graceful skip až jako fallback)
- Lane: @explorer – najít RGB preview flag v gRPC/proto
- Hotovo (ses_f819ab29effehwcPv2vuJY1F4L): RGB flag NEEXISTUJE (proto request/response ani config.fbs nic nemají, previewImage je opaque tenzor). Volby: graceful skip / VAE dekódování (těžké) / vypnutí preview logu

## Doplnění – previewImage vypnout úplně (zadáno)
- Požadavek: žádné preview během samplování/generování – nedekódovat, nelogovat, neposílat do UI
- Lane: @fixer, scope: apps/server generate + grpc-client (UI případně jen typy)
- Hotovo (ses_f8197786fffe93Pv4mcNJxzTNK): onPreview no-op, previewImage se zahazuje bez Buffer převodu, UI neměněno (preview eventy volitelné, progress/complete nezávislé). Ověřeno: tsc server 0, test boot :3999 bez "preview" v logu (potvrzeno i orchestrátorem: 3 soubory +12/-23, žádný sendSSE preview ani decode error)

## Doplnění – no such table tensorhistorynode (hlášeno)
- Symptom: `listProjects: count failed for "Untitled-*": no such table: tensorhistorynode` (log spam, některé projektové DB tabulku nemají)
- Lane: @fixer, scope: apps/server project-browser count logika (jen čtení DT DB)
- Hotovo (ses_f81957d4affeXrInjWc0WueHCj): isMissingTableError + missingTableWarned + kontrola sqlite_master před COUNT, chybějící tabulka → 0 bez error logu (1 warn), i getProjectEntries chráněno. Ověřeno: tsc server 0, reálný list 5 projektů bez "no such table" (potvrzeno i orchestrátorem, +125/-12)

## Doplnění – reálné čtení DT Documents (zadáno)
- Požadavek: načítat z Library/Containers/com.liuliu.draw-things/Data/Documents místo fallbacku
- Lane: @fixer – diagnostika EPERM příčiny + zprovoznění čtení (jen čtení, žádný zápis)
- Hotovo (ses_f81a5d3f7ffe5L3TBzTy1gVxmJ): příčina = chybějící Full Disk Access (TCC), kód správně (resolveEnvPath OK, práva drwx nykadamec OK, stat projde / readdir EPERM ve všech runtimes, Mail/Safari sondy taky EPERM). Kód neměněn – nutný manuální krok uživatele

## Doplnění – build/diagnostika neviditelné animace (hotovo)
- Příčina (ses_f81d95db2ffey4nTrwfW6ZBwmp): dev server vůbec neběžel (curl 000), ui se resolvuje na src (žádný dist) – HMR bere zdroj, rebuild netřeba. Desktop dev restartován s --force (PID 51603, :5173 200), servíruje motion.nav. Animace hraje jen při togglu (initial={false}), reduced-motion ji vypíná

## Doplnění – desktop sidebar podle sidebarNew (zadáno, branch feat/opendraw_v2/sidebar)
- Požadavek: desktop sidebar v kódu podle pencil designu sidebarNew (tPW5O) + hide varianty (f6xVm, M5XCm) z /Users/nykadamec/Documents/openDraw.lib.pen
- Lane: @designer (pencil MCP app desktop + implementace UI), scope: apps/desktop/src + packages/ui sidebar komponenty/stránky, theme tokeny
- Hotovo (ses_f8215eb99ffe0Uo2teN1EAp6C2): nový DesktopSidebar.tsx (overlay+static, peek/hover zóna 24px, ouško, Cmd/Ctrl+B, Escape, localStorage opendraw.sidebarVisible), App.tsx přepsán na DesktopSidebar, tokeny --sidebar-bg/--sidebar-shadow + .sidebar-panel/.sidebar-edge-tab, font Jost. Ověřeno: tsc ui+theme OK (potvrzeno i orchestrátorem), curl :5173 200, routes /, /gallery, /canvas, /projects, /loras, /settings zachovány, copy česky OK

## Doplnění – LoRA slider rozsah [-8,8] (zadáno)
- Požadavek: slider váhy LoRA v ConfigurationPanel z [-2,2] na [-8,8]
- Lane: @fixer, scope: packages/ui config panel (jen min/max slideru)
- Hotovo (ses_f817ce310ffezGEtmYa4NtbSZw): 3 výskyty LoraWeightSlider (GeneratePage:1746, ParamSheet:718, CanvasComposer:528) → min -8 / max 8 + clampy; zbývající Math.min(2) je detent sheetu, nesouvisí. Ověřeno: tsc ui 0 (potvrzeno i orchestrátorem grep)

## Doplnění – LoraWeightValue klik-ruční editace (zadáno)
- Požadavek: klik na LoraWeightValue → přímá editace čísla (Enter potvrdí, Escape/blur zruší/potvrdí, clamp [-8,8])
- Lane: @fixer, scope: 3 výskyty LoraWeightValue (GeneratePage, ParamSheet, CanvasComposer)
- Hotovo (ses_f817ad182ffemxakNo8txJbMj9): EditableLoraWeight / EditableSheetLoraWeight (autofocus+select, Enter/blur commit + clamp [-8,8], Escape zruší, stejný handler jako slider). Ověřeno: tsc ui 0 (potvrzeno i orchestrátorem grep)

## Doplnění – fatskinny slider bez efektu i na -8 (šetřeno)
- Symptom: skinny_fat_v2_loraholic_lora_f16.ckpt weight -8, výsledek stejný (log: váha -8 odeslána, steps 8, cfg 1)
- Stopy: (a) clamp váhy v fbs-config/server cestě, (b) návod Civitai modelu (trigger, rozsah, sampler)
- Lane: @explorer (kódování váhy) + @librarian (Civitai stránka) paralelně
- Hotovo @explorer (ses_f81756625ffe2cnG5SCulB65Et): váha jde 1:1 bez clampů (generate.ts → fbs-config.ts:107 createLoRA → float32) – -8 projde až do DT, příčina je na straně DT/modelu. @librarian běží
- Hotovo @librarian (ses_f81756623ffeUX4c57is5VxVp8): model 2554553 v2 (Krea-2_v2, base Krea 2) – ŽÁDNÝ trigger word (trainedWords []), rozsah -10..10 (v2 poloviční síla), negative=skinny. Klíč: prompt musí spolupracovat (popsat směr, slider jen dolaďuje); soubor v2 + base krea_2_turbo sedí
