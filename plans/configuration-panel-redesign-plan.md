# Redesign Configuration Panel (desktop, pravý sidebar)

Základ: design v `~/Documents/opendraw.pen` (pencil MCP) — frame `BEtjw` „Config Panel“, `xWpeF` „Model Picker“, komponenty `Q9VXx` LoRA Card, `c54Qe` Model Card.

**Hlavní pravidla:**
1. **VŠECHEN stávající obsah v kódu zůstává 1:1** (§2) — mění se jen vizuál a rozložení do 4 tabů. Žádný parameter, toggle, input ani chování se nemaže.
2. **Options Bar = jen přebalený existující obsah** — žádné Presets, žádné Palette (frame `Z5zYc` z pencilu se nepoužívá).
3. **Trigger chips nejsou ukázkové** (`+ neon`, `+ rain` v pencilu je jen vizualizace) — v kóde jsou **LoRA trigger words chybějící v promptu** (`missingTriggers`/`orphanTriggers`, `GeneratePage` 1221+). Stejná data a chování, jen vizuál čipů dle designu.
4. **Styl = jako left sidebar (`DesktopSidebar`)** — ne liquid glass. Panel dostává existující utility `.sidebar-panel` z `config-theme/src/index.css` (tmavé sklo `--sidebar-bg`, `backdrop-filter: blur(40px)`, radius 18, stín `--sidebar-shadow`), vnitřní karty a interactive prvky berou vizuální jazyk nav itemů (`rounded-[10px]`, aktivní `bg-white/[0.08] text-white font-medium`, hover `bg-white/[0.05]`, terciární text `text-[#888]`). Žádné nové glass tokeny.

## 1. Cíl a rozhraní

- Panel 380 px, fixed `top-4 right-4`, `h-[calc(100vh-32px)]`, radius 18 px (`.sidebar-panel`) — rozměry jako dnes, jen jiný background.
- Z „everything-expanded“ sidebaru (sticky header + ParamChipBar + 8 accordionů) se dělá **tabovaný compact panel se 4 taby** (SCHVÁLENO).
- Generate/Stop sticky dole — **ve všech tabkách**.
- Hide/show FAB chevron + `configPanelVisible` — bez změny.
- **Mobile layout (pod `lg`) se nedotýká** — včetně `ParamSheet`.

## 2. Struktura (mapping na kóde)

```
GenConfigPanel (přepracovat)
├─ Header                        # sticky, vizuál dle pencilu + styl sidebaru
│  ├─ Title „Konfigurace“        # nezměnit
│  ├─ ServerBadge (NEW)          # dot + label, z existujícího `connected` state
│  └─ Akce: reset / paste / get  # jako dnes (ArrowRotate, ClipboardImport, ClipboardExport)
├─ OptionsBar (NEW)              # 4 segment buttons 32px, aktivní roztažený s label
│  ├─ Prompt / Model / Sampling / Effects
├─ TabContent (switch dle activeTab)
└─ GenerateButton (sticky bottom) # ikona + „Generovat“ + meta (sizeLabel · steps),
   # generating → Stop (červený, handleStop), disabled/label logika bez změny
```

### Options Bar — 4 taby (SCHVÁLENO)

| Tab | Obsah (vše z dnešního kódu) |
|---|---|
| **1. Prompt** | prompt textarea, **trigger chips** (LoRA trigger words chybějící v promptu — `missingTriggers`/`orphanTriggers`, klik = vložit word do promptu), rozbalovací **negative prompt** |
| **2. Model** | ModelCard → po kliknutí se **inline změní na ModelPicker** (viz níže); + **LoRA** (aktivní jako chipy s −/+ a X, „Přidat LoRA“ → search + list) |
| **3. Sampling** | sampler (dropdown), slidery **Steps** a **CFG**, **Rozměry**: SizeLevel (Velikost — hodnoty `SIZE_LEVELS` z kódu), AR (1:2…16:9), info `width×height`, **custom toggle** + W/H inputs (round8), **Seed** (input + ⏳ + Randomize checkbox + Seed Mode) |
| **4. Effects** | **Pokročilé**: Shift (vč. auto/resolution-dependent), Clip skip, Strength, SSS, CFG Zero Star, Zero Negative Prompt, Resolution dependent shift, Uložit do galerie, Tiled Decoding (+3 slidery), Tiled Diffusion (+3 slidery); **Upscaler** (model select + scale factor); **Refiner** (model input + list dostupných + refiner start); **Hires Fix** (toggle + start W/H + denoising strength) |

`ParamChipBar` mizí — její role (přehled model/steps/cfg/size) převezme meta v GenerateButton; žádné akce se neztratí, všechny parametry žijí v tabech.

### Mapování stávajících accordionů → taby

| Stávající (`AccordionSection id`) | Cíl |
|---|---|
| (prompt/negative/triggerChips z `PromptCard`) | **Prompt** |
| `model` (search + local + DT+ cloud) | **Model** → ModelCard ⇄ ModelPicker |
| `lora` (search, list, weight controls) | **Model** → LoRA chips + „Přidat LoRA“ |
| `sampler` (select, steps, cfg) | **Sampling** |
| `rozměry` (SizeLevel, AR, dims info, custom W/H) | **Sampling** |
| `pokročile` — seed část (seed input, ⏳, randomize, seed mode) | **Sampling** |
| `pokročile` — ostatní (shift, clip-skip, strength, sss, toggles, tiled) | **Effects** |
| `upscaler`, `refiner`, `hires-fix` | **Effects** (jako karty) |

### Detailní inventory (každý prvek musí zůstat)

**Prompt tab**
| Stávající | Cíl |
|---|---|
| `PromptCard` (prompt, `collapsibleNegative`, `triggerChips`) | PromptBlock dle designu: label + Clear (Clear = nová viditelná akce na stejném state), textarea, **TriggerChipList** (LoRA trigger words — viz §3), NegativeRow s chevronem (stejné rozbalovací chování) |

**Model tab**
| Stávající | Cíl |
|---|---|
| `ModelSelectedLine`, `ModelSearchInput`, `ModelList`, `CloudModelsDivider`, `CloudModelList` | **ModelCard** (instance `c54Qe`) — po kliknutí se **inline změní na ModelPicker** (SCHVÁLENO, frame `xWpeF`): search + rows 52 px (ikona 32, název, meta, check); DT+ cloud jako 2. sekce se dividerem; filtr `modelSearchDesktop` pokrývá obě sekce jako dnes; `setModel(m)`/`setModel(cm.file)` bez změny. Zavření (chevron/zpět) vrátí ModelCard. Animace přepnutí: height/opacity spring jako v `DesktopSidebar` (AnimatePresence) — Q4 |
| `LoraSearchInput`, `LoraList` (active-first sort, `displayLoraName`), `LoraWeightControls` | LoRA card dle designu: header s count, **aktivní LoRA = chipy** (název + `− value +` + X), „Přidat LoRA“ rozbalí search + list. **Vahy jen přes `−` a `+`** (SCHVÁLENO): step 0.01, s Shift 0.1 (jako dnes); slider −8..8 a `EditableLoraWeight` z čipu mizí (jediné záměrné odebrání prvků). X = remove (dnes checkbox toggle), `setLoras` bez změny |

**Sampling tab**
| Stávající | Cíl |
|---|---|
| `SamplerSelect` | sampler row dle designu (ikona + label + value + chevron), dropdown se stejným `SAMPLERS` |
| `RangeSliderSteps` (1–50), `RangeSliderCfg` (1–30, step 0.5) | inline slidery (track 4px + knob 14 dle designu), stejný state/range |
| `ChoiceRow „Velikost“` (SIZE_LEVELS/SIZE_LABEL) | **zachránit beze změny** (SCHVÁLENO) — jako compact row/select v SizeCard, hodnoty `SIZE_LEVELS` + `SIZE_LABEL` z kódu |
| `ChoiceRow „Poměr stran“` (4-col) | AR segmenty `1:2 1:1 4:5 3:4 2:3 16:9`, stejný `ASPECT_RATIOS` |
| `DimensionInfo` | dims text v headeru card (`width×height`) |
| `ToggleRow „Vlastní rozměry“` + `CustomWidthInput`/`CustomHeightInput` (64–4096, step 8, `round8`) | **custom toggle zachrán** (SCHVÁLENO) + W/H inputs; inputs disabled, když je toggle vypnutý |
| `SeedNumberInput`, `SeedRandomizeCheckbox`, `SeedRandomButton` (⏳), `ChoiceRow „Seed Mode“` | seed sekce v Sampling — bez změny logiky |

**Effects tab** — stejné inputy, kartový vizuál; sekce: **Pokročilé** (Shift, Clip skip, Strength, SSS, toggles CFG Zero Star / Zero Negative Prompt / Resolution dependent shift / Uložit do galerie, Tiled Decoding + 3 slidery, Tiled Diffusion + 3 slidery), **Upscaler** (select + scale factor), **Refiner** (input + conditional list + start slider), **Hires Fix** (toggle + conditional W/H + strength). Všechny conditional bloky (`tiledDecoding &&`, `hiresFix &&`, `refinerModel &&`) zachovány.

## 3. Trigger chips (oprava vůči pencilu)

- Pencil `+ neon / + rain / − blurry` = **pouze vizualizace**.
- Skutečné: `triggerChips` v `GeneratePage` (1221) — **LoRA trigger words, které nejsou v promptu** (`missingTriggers`) + osamělá (`orphanTriggers`). Klik chipu = vložit word do promptu.
- V redesignu: **stejná data a chování**, vizuál čipů dle designu (rounded chip, `+` prefix, `−` u negativních). Umístění: pod promptem v **Prompt tabce**.

## 4. Stav a interakce

- `const [activeTab, setActiveTab] = useState<'prompt'|'model'|'sampling'|'effects'>('prompt')` — desktop-only; nahrazuje `openSection`/`openDesktopSection` (accordion state) v desktop cestě. Mobile `ParamSheet` + `sheetOpen`/`sheetSection` zůstávají.
- ModelCard ⇄ ModelPicker: lokální state `modelPickerOpen` (default zavřeno); po `setModel` picker zůstává otevřený (uživatel může vybrat jiný model), zavře se explicitně (chevron/zpět).
- `configPanelVisible` + FAB bez změny.
- Reset/paste/get config — chování nezměníme, jen vizuál.

## 5. Vizuál = jazyk `DesktopSidebar` (místo liquid glass)

Převzít ze stávajícího left sidebaru, žádné nové glass tokeny:

- **Panel:** utility `.sidebar-panel` (config-theme `index.css` ř. 90): `background-color: var(--sidebar-bg)`, `backdrop-filter: blur(40px)`, radius 18, `box-shadow: var(--sidebar-shadow)`, bez rámečku. Nahradí dnešní `bg-canvas/30 backdrop-blur-2xl rounded-2xl shadow-2xl`.
- **Karty uvnitř** (ModelCard, SamplingCard, SizeCard, LoRACard, sekce Effects): jednotný vzhled — `rounded-[10px]`, pozadí `bg-white/[0.04]` (stejná rodina jako nav hover), border `border-white/[0.06]` (subtle), padding 12, gap 12. Vizuální test na light + dark (tmavé sklo funguje obě — `--sidebar-bg` je themovaný token).
- **Interactive prvky:** aktivní stav `bg-white/[0.08] text-white font-medium`, hover `hover:bg-white/[0.05]`, terciární text `text-[#888]` — přesně jako `SidebarNavLink`.
- **Slidery/inputs/selects:** nechat stávající (`bg-surface`, `border-border`, `accent-txt-primary`) — fungují v obou theme; jen radius sjednotit na 10.
- **Header:** sticky, lehký blur pod ním pro čitelnost při scrollu (`backdrop-blur-md bg-black/20`); border `border-white/[0.06]`.
- **GenerateButton sticky:** `bg-surface-el` (dnes) + glass podklad `bg-black/30 backdrop-blur-xl`; generating → červený Stop bez změny.
- **Animace přepínání tabů:** AnimatePresence `opacity + height` spring (`stiffness: 300, damping: 30`) — **stejný spring jako v `DesktopSidebar`** nav collapse.
- Theme: vše přes existující tokeny → přepínání `[data-theme]` bez rebuildu (quirk z AGENTS.md).

## 6. Součásti a soubory

- `packages/ui/src/pages/GeneratePage.tsx` — přestavba desktop layoutu (1359–1857): OptionsBar, tab switch, GenerateButton s meta, ModelCard/ModelPicker. **Stávající `data-el-name` atributy se zachovávají** (přesunou do nových komponent); záměrně mizí jen: `LoraWeightSlider` + `EditableLoraWeight` (rozhodnutí Q2 — vahy jen ±).
- NOVÉ komponenty (`packages/ui/src/components/`): `ConfigOptionsBar.tsx`, `ServerBadge.tsx`, `ModelCard.tsx` (⇄ ModelPicker inline), tab komponenty (`PromptTab`, `ModelTab`, `SamplingTab`, `EffectsTab`).
- Reuse: `PromptCard` → PromptBlock vizuál (stejné props), LoRA obsah → LoRACard (stejná logika).
- `AccordionSection` — v desktop cestě mizí (tab switch), **v mobile zůstává**; v Effects tabu conditional sekce jako plain rows (accordion nepoužívat).
- `packages/config-theme` — jen případně `.config-card` utility (kopie jazyka sidebaru pro vnitřní karty) — Q5.

**Mobile layout se nedotýká.**

## 7. Fáze implementace

1. **Skelet:** OptionsBar + tab switch + GenerateButton (s meta) + ServerBadge; panel přepnout na `.sidebar-panel`; taby renderují stávající accordiony do nového rámu (fun parity, starý vizuál).
2. **Prompt tab:** PromptBlock (clear, trigger chips = LoRA words, negative).
3. **Model tab:** ModelCard ⇄ ModelPicker (local + DT+ cloud) + LoRACard (chips, −/+, přidat).
4. **Sampling tab:** sampler row, steps/cfg slidery, SizeCard (SizeLevel/AR/custom + toggle), seed sekce.
5. **Effects tab:** pokročilé + upscaler + refiner + hires-fix jako karty.
6. **Vizuální sjednocení s sidebarem:** §5 (karty, nav jazyk, spring animace tabů); light + dark theme.
7. **Polish:** a11y (tab role, focus ring, keyboard), skrollování, **verifikační procházka inventory §2** (každý data-el-name existuje, vyjma záměrně odstraněného LoRA weight slider/EditableLoraWeight).

## 8. Open questions (zbývající)

- **Q4** — ModelCard ⇄ ModelPicker přepnutí: default **inline morph s height/opacity spring** (jako sidebar nav collapse); alternativa: crossfade bez height animace.
- **Q5** — `.config-card` utility v config-theme (sdílená třída pro vnitřní karty) vs. inline Tailwind v komponentách. Default: **utility** (konzistence se `.sidebar-panel`, jedno místo údržby).

Už schváleno: 4 taby (Q1), LoRA weight jen ± (Q2), SizeLevel z kódu + custom toggle (Q3), ModelCard se po kliknutí změní na ModelPicker (Q4 dříve).

## 9. Acceptance criteria

- [ ] Desktop sidebar odpovídá pencil frame `BEtjw` (380 px, header + badge, OptionsBar 4 taby, karty, sticky GenerateButton s meta).
- [ ] **Každý prvek z inventory §2 existuje a funguje** (verifikace: grep `data-el-name` vs. tabulka — žádný chybějící, vyjma záměrně odebraných `LoraWeightSlider`/`EditableLoraWeight`).
- [ ] Trigger chips = LoRA trigger words chybějící v promptu (stejné chování jako dnes), vizuál dle designu.
- [ ] LoRA weight nastavitelná jen přes `−`/`+` (0.01 / Shift 0.1).
- [ ] ModelCard se po kliknutí změní na ModelPicker a zpět.
- [ ] Panel vypadá jako `DesktopSidebar` (`.sidebar-panel`, nav jazyk barev/radiusů), light + dark theme bez rebuildu.
- [ ] Mobile layout beze změny (stejné chování pod `lg`, `ParamSheet` funkční).
- [ ] Typecheck (`bunx tsc --noEmit -p packages/ui/tsconfig.json`) + build UI prochází.
