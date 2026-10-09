# Plán: Parita s novým DT gRPC – B (defaultní konfigurace), E (diagnostika serveru), F (UpdateModelList)

> Branch: `feat/dt-protocol-parity`. Detailní návrh; implementace fáze po fázi po schválení.
> Požadavek: „jen sepiš, žádný kód neupravuj". Tento plán je výstup, kód až ve fázi 2.
>
> Podklad (analýza 2026-10-08): porovnání našeho protokolu (`packages/protocol/proto/*`)
> vs. aktuálního upstreamu Draw Things (`wee-todd/DrawOtherThings` `Libraries/GRPC/Models/Sources/*`).
> **Závěr protokolu: žádné nové RPC ani pole v requestech/odpovědích, `.fbs` jen metadata.**
> Reálné novinky jsou na úrovni *chování / dat*: katalog modelů (hotové přes `ref_models.ts`),
> oficiální doporučené konfigurace (`models.drawthings.ai/configs.json`), identifikace serveru
> (`serverIdentifier`, `tags`), a RPC `UpdateModelList` pro sync modelů do DT serveru.
>
> Další (následující) úkol: redesign „Configuration panel" (right sidebar) v pencil MCP.
> Viz §6 – odlišný artefakt, nepatří do tohoto plánu implementace.

## 0. Současný stav (co máme, co ne)

| Oblast | Stav v kódu |
|---|---|
| Katalog cloud modelů | `scripts/ref_models.ts` → `cloud-models.json` (248 modelů) + route `/api/cloud-models`. **Hotovo.** |
| Model version v generate | `generate.ts:166-195` – echo `override.models` → fallback `getCloudModels()`. Funguje. |
| Parametry generování | `fbs-config.ts` staví FlatBuffer **výhradně z client requestu** (`FlatBufferConfigInput`). Žádná per-model doporučená výchozí. UI defaulty: steps 28, cfg 3.5, shift 1.0 (resolutionDependent), sampler default. |
| `serverIdentifier` | Proto ho má (`imageService.proto` EchoReply field 6). `EchoResponse` (api-client) ho forwarduje jako `serverIdentifier: string`, ale **generate.ts ho nikde neloguje/nezpracovává**. |
| `tags` (ImageGenerationResponse field 6) | Proto ho má. `grpc-client.ts` zpracovává `generatedAudio`, `signposts`, `chunkState` – **`tags` nečte**. |
| `ControlPanelService` | Proto + RPC `UpdateModelList` definované, ale **`GrpcPort` ho nevyužívá** (dle dt-grpc-emu plánu: ControlPanelService se neimplementuje). |
| `configs.json` | Nezneznámé – `packages/protocol` žádný snapshot nemá. |

**Klíčová čísla (overeno):**
- `configs.json` = 57 záznamů, 46 distinct modelů, každý s `configuration` (steps, guidanceScale, shift, sampler, negative, …) + `name`/`version`/`negative`.
- Z našich 248 cloud modelů má **doporučený config jen 19** (overlap s `configs.json`). **229 modelů žádné doporučené konfigurace nemá** → generují se s generic UI defaulty.

---

## 1. Úkol B – Defaultní (doporučené) konfigurace pro modely

### Cíl
Když uživatel vybere model, generování má použít **doporučené parametry pro ten model** (steps, guidance/CFG, shift, sampler, negative prompt, teaCache…) místo generic defaultů – protože DT modely (FLUX, Qwen 2.1, Z-Image, Wan…) mají zásadně odlišná optima. Dnes je to „jedny settings pro všechny", co u FLUX.2/Qwen 2.1 dává slabší výsledek.

### Zdroj dat
`https://models.drawthings.ai/configs.json` – stejný public katalog jako `models.drawthings.ai/models.json` (žádný token). Tvar:
```json
[ { "name": "Qwen Image 2.1", "version": "qwen_image_2.1", "negative": "...",
    "configuration": { "model": "qwen_image_2.1_q8p.ckpt", "steps": 40,
      "guidanceScale": 1, "sampler": 16, "shift": 1, "maskBlur": 1.5,
      "teaCache": false, "loras": [], "controls": [], ... } } ]
```

### Navržený design (dva kanály, doporučený = hybrid)

**B-core – server-side enrichment (primární, robustní):**
1. Nová service `apps/server/src/services/model-configs.ts` – načte + validuje snapshot `configs.json` (analogie `cloud-models.ts`), index `model file → {steps, cfg, shift, sampler, negative, …}`.
2. Zdroj snapshotu: (a) statický soubor `apps/server/src/model-configs.json` obnovený skriptem `scripts/ref_models.ts` (rozšířit o `configs.json`), případně (b) live fetch při startu serveru. Doporučeno (a) – deterministické, offline, stejný workflow jako cloud-models.
3. V `generate.ts` po rozřešení `modelVersion`: pokud klient **neexplicitně** poslal non-default param (viz níže „kdy se nepřenáší"), přenést doporučené hodnoty do `FlatBufferConfigInput`. Priorita: client explicit value > recommended > generic default.
4. Nový volitelný request flag `applyRecommended?: boolean` (default `true`) – kdyby UI mělo vlastní smysluplný prefilled stav, může enrichment vypnout.
5. **Detece „neexplicitní" value:** nejjednodušší a nejméně překvapivé = enrichment se použije **jen pro parametry, které UI ještě nedotklo** – řeší se na UI (B-ux níže) posláním flagu `touched`/`pristine` per field, nebo na serveru porovnáním s `DEFAULT_SETTINGS` signaturou. Doporučeno: UI pošle `pristineParams: string[]` (sestava fieldů, u kterých uživatel nic nezměnil od výběru modelu) a server jen ty nahradí. Bez toho by enrichment pokaždé přepsal uživatelem nastavené steps a byl by překvapivý.

**B-ux – client prefill (volitelné, lepší UX):**
1. Nová route `GET /api/model-configs` (api-client `fetchModelConfigs()`).
2. UI: při změně modelu (`setModel`) naplní parametry z doporučení **jen pokud** pro ten model nemáme už explicitní uživatelský stav; v Configuration panelu ukáže badge „recommended" + tlačítko „Použít doporučené" a „Resetovat na moje".
3. Synchronizace se `localStorage` persistencí – doporučení se NEukládají jako „user settings", jen se aplikují při přepnutí modelu.

### Fáze
- **B0 kontrakt:** definovat mapování klíčů `configs.json` → `FlatBufferConfigInput` (steps→steps, guidanceScale→cfg, shift→shift, sampler→sampler enum, negative→negativePrompt default, teaCache*/causalInference→respective). Zamrazit.
- **B1 snapshot:** rozšířit `scripts/ref_models.ts` o stažení `configs.json` → `apps/server/src/model-configs.json` (+ validace, dedup, `--dry-run`/`--verbose` jako u modelů). Pustit, commnit snapshot.
- **B2 server enrichment:** `model-configs.ts` + integrace v `generate.ts` (priorita + `pristineParams`/`applyRecommended`). Test: Qwen 2.1 → steps 40, cfg 1, shift 1 (ne 28/3.5/1.0).
- **B3 (volitelné) route + UI prefill:** `/api/model-configs` + Configuration panel „recommended" badge.
- **B4 validace:** e2e pro 3–4 reprezentativní modely (FLUX.2 dev, Qwen 2.1, Z-Image Turbo, Wan 2.1) – srovnat výsledný config vs. DT doporučení; regression že explicitní user value se nepřepíše.

### Co nedělat (B)
- Neukládat doporučení do `localStorage` jako trvalé user settings (přepnou se při změně modelu).
- Nepřenášet blind všech 57 klíčů `configs.json` – jen ty, co umíme bezpečně mapovat a co `fbs-config.ts` umí serializovat.
- Neměnit `fbs-config.ts` serializaci (pouze vstup do `FlatBufferConfigInput`).

---

## 2. Úkol E – Identifikace serveru a diagnostika (`serverIdentifier`, `tags`)

### Cíl
V multi-server / Bridge Mode scenáři vědět **který DT server** (lokální DT app vs. DT+ cloud) odpověděl na generování. Dnes `serverIdentifier` a `tags` projdou protokolem, ale nic se s nimi nedělá – při problémů se nenechá diagnostikovat, jestli generovalo DT+ cloud nebo lokální GPU.

### Co je v kódu
- `imageService.proto`: `EchoReply.serverIdentifier = 6` (uint64, „64-bit server identifier … remote server or same server"), `ImageGenerationResponse.tags = 6` (repeated string, „track which server responded").
- `api-client` `EchoResponse` už forwarduje `serverIdentifier: string`.
- `generate.ts` / `grpc-client.ts` oba **nevyužívají** `tags`; `serverIdentifier` se do SSE/logu nedostane.

### Navržený design
1. **Echo meta do API:** `GET /api/echo` už vrací `serverIdentifier`; doplnit (nebo nová meta route) `thresholds`/tier, pokud chceme v UI ukazovat „DT+ active". Minimálně: uchovat `serverIdentifier` v server-side state.
2. **Logování:** `generate.ts` při startu runu logne `serverIdentifier` + (po dokončení) `tags[]`. Tím se do `logs` dostane „generováno na serveru X".
3. **SSE meta event:** při `complete` (nebo novým lehkým `meta` eventem) odeslat `{ serverIdentifier, tags, tier? }`. UI to ukládá k výsledku (galerie item metadata) → „který server" je vidět v detailu obrázku.
4. **UI indikátor (volitelné, váže se na redesign §6):** v Configuration panelu header / u Generate buttonu drobný badge: `● DT+ cloud` vs `● Local DT` (z `serverIdentifier` ≠ 0 a `tags`).
5. **Bridge Mode odlišení:** pokud je `serverIdentifier` stabilní a liší se od lokálního → označit „remote". Přesná heuristika se zamrazí při B0/E0 podle pozorovaného chování DT+ (otevřená otázka níže).

### Fáze
- **E1 server log + state:** uchovat `serverIdentifier` z echo, logovat při generování.
- **E2 SSE meta:** `tags` + `serverIdentifier` do `complete`/`meta` event; api-client callback `onMeta?`.
- **E3 UI indikátor** (volitelné, součást redesignu §6).

### Co nedělat (E)
- Neměnit protokol / přetvářet `serverIdentifier` (uint64) na jiný typ bez důvodu – forwardovat jako string.
- Nezávisle blokovat generování na `tags` (je to pure diagnostic, never gating).

---

## 3. Úkol F – `UpdateModelList` (ControlPanelService) – push modelů do DT serveru

### Cíl
Doplnit chybějící směr syncu: `ref_models.ts` aktualizuje **naše** `cloud-models.json`; `UpdateModelList` by umožnilo poslat **kuraovaný seznam modelů přímo do DT serveru** (lokální DT app v Bridge Mode), ať DT app/server nabízí stejné modely bez ruční editace DT databáze. Umožní to „přepnout" DT server na naši model setu.

### Co je v kódu
- `controlPanel.proto`: `rpc UpdateModelList(UpdateModelListRequest) returns (UpdateModelListResponse)`, `message UpdateModelListRequest { string message = 1; repeated string files = 2; }`.
- `GrpcPort` / `grpc-client.ts` mají ImageGenerationService metody (echo, upload, generate…), ale **žádný ControlPanelService klient** – RPC se nevolá.

### Navržený design
1. Rozšířit `GrpcPort` rozhraní o `updateModelList(files: string[], message?: string): Promise<string>` + implementace v `grpc-client.ts` (nový ControlPanelService kanál na stejném DT_HOST:DT_PORT, stejný TLS/auth jako ImageGenerationService).
2. **Zdroj souborů:** `cloud-models.json` (naše kuraovaná list) – `updateModelList` posílá `files` = pole `.ckpt` názvů.
3. **Spouštění:** (a) on-demand route `POST /api/cloud-models/sync` (admin akce z Configuration panelu / Settings), (b) volitelně při startu serveru s flagem `SYNC_MODELS_ON_START=true`. Doporučeno (a) – explicitní akce, ne skrytý side-effect na DT databázi.
4. **Idempotence + log:** `UpdateModelListResponse.message` logovat; operace je reentrant (stejná list → stejný výsledek).

### Rizika / omezení
- `UpdateModelList` je ControlPanel RPC = „privátní cluster API" (dle dt-grpc-emu plánu se ControlPanelService neimplementuje). Musí ověřit, že lokální DT app Bridge Mode tento RPC přijme a **neztratí** tím vlastní modely (semantika: nahradit vs. přidat je z protu nejasná – `repeated string files`). **Zamrazit ve F0 testem.**
- Nemá smysl volat proti DT+ cloudu (jen lokální DT server).

### Fáze
- **F0 kontrakt + semantika:** otestovat `UpdateModelList` proti lokální DT app (Bridge Mode) – nahrazuje list, nebo merge? Co s modelem, který v DT není stahnutý? Zamrazit.
- **F1 GrpcPort + client:** `updateModelList()` + Test.
- **F2 route + UI akce:** `POST /api/cloud-models/sync` + tlačítko „Sync modelů do DT" (Configuration/Settings).
- **F3 (volitelné) on-start flag.**

### Co nedělat (F)
- Nevolat `UpdateModelList` implicitně při každém startu bez flagu (side-effect na DT DB).
- Neimplementovat zbytek ControlPanelService (Throttling/Pem/SharedSecret/ComputeUnit) – jen `UpdateModelList`.

---

## 4. Pořadí a závislosti

1. **B** (největší uživatelský dopad, nezávislé) → B0→B4.
2. **E** (levná diagnostika, nezávislé) → E1→E2 (E3 až s redesignem §6).
3. **F** (závisí na F0 semantice; nezávislé na B/E) → F0→F2.

B a E se dají dělat paralelně; F se rozjede až po F0 testu.

## 5. Otevřené volby ke schválení
1. **B:** enrichment server-side (B-core) + UI prefill (B-ux) – obě, nebo jen server-side?
   Doporučení: B-core jako minimum, B-ux jako follow-up (váže se na redesign §6).
2. **B:** „neexplicitní value" – `pristineParams: string[]` z UI, nebo server-side srovnání s `DEFAULT_SETTINGS`?
   Doporučení: `pristineParams` (přesnější, žádné překvapení).
3. **B snapshot:** statický `model-configs.json` (obnovený skriptem) vs. live fetch při startu? Doporučení: statický.
4. **E:** `serverIdentifier` ≠ 0 = „remote/DT+"? Zamrzít po pozorování (E0) – heuristika se potvrdí reálným DT+ tokenem.
5. **F:** on-demand route (doporučeno) vs. on-start flag? A ověřit semantiku nahrazení v F0.

## 6. Následující úkol (NEVÝCHODÍ z tohoto plánu) – redesign „Configuration panel"
Po schválení B/E/F: navrhnout v **pencil MCP** redesign right sidebar „Configuration panel"
(deSKTOP `GenConfigPanel`, dnes: PromptCard + ParamChipBar + akordeóny Model/Sampler/Rozměry/
Pokročilé/Upscaler/Refiner/Hires Fix/LoRA + Generate button). Navrh jako `.pen` frame + shrnutí
doporučené struktury pro implementaci. Mobilní `ParamSheet` (bottom-sheet) se redesignu **neúčastní**.

## Stav
- Navrženo 2026-10-08, kód nezačínal. Branch `feat/dt-protocol-parity` připravená.
- Očekává se schválení §5 (otevřené volby) → pak fáze B0/E0/F0.
