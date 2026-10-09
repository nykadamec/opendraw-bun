# Plán: Vlastní Draw Things-kompatibilní gRPC server (dt-grpc-emu)

> Branch: `feat/packages/dt-grpc-emu`. Návrh + výzkum, implementace až po schválení.
> NENÍ to jen emulátor pro naše testy – plnohodnotný server, na který se připojí i aplikace Draw Things jako klient (remote server).
> Podklady: @explorer inventura (ses_f8d0b2326ffeaCPP0ZZh6wR921), @librarian oficiální API + cloud (ses_f8d0b0b04ffem4hUhydbhHPXTl).

## 1. Cíl
Balíček `packages/dt-grpc-emu/` – samostatný gRPC server mluvící protokolem Draw Things tak věrně, že ho jako remote server přijme (a) naše appka (`apps/server` přes `GrpcPort`, přepnutí jen `DT_HOST/DT_PORT`), i (b) samotná aplikace Draw Things (přidání remote serveru `127.0.0.1:PORT`). Generuje syntetické obrázky (deterministické z seedu), takže běží bez GPU a bez DT+ kreditu. Cloud funkce (token flow, katalog, thresholds, LoRA upload) slouží lokálně.

## 2. Protokolová věrnost (nutná pro DT app jako klienta)
- `Echo`: `{message, files[], override{models,loras,controlNets,textualInversions,upscalers}, sharedSecretMissing, thresholds, serverIdentifier}`. `files` + `override.models` musí odpovídat skutečně nabízeným modelům (DT app podle nich staví UI).
- `GenerateImage`: plný povrch requestu – `image`/`mask` (sha256 CAS), `hints` (ControlNet tensory), `contents` blob store, `keywords`, `device` (PHONE/TABLET/LAPTOP), `chunked` negotation, `sharedSecret`. Stream: signposty (textEncoded → sampling steps → imageDecoded …), `previewImage`, `generatedImages` s `chunkState` (MORE/LAST), `scaleFactor`, `tags`, `downloadSize`.
- `FilesExist` / `UploadFile` (CAS, 4MB chunky, offsety, sha256) – DT app posílá LoRA a assety tudy.
- `Pubkey`, `Hours` (thresholds community/plus/expireAt).
- Transport: TLS (vlastní CA + server cert, chain ve formátu který DT app přijme), `grpc.max_receive_message_length` 64MB+, komprese `identity` (případně `gzip`), `grpc.primary_user_agent` / `ssl_target_name_override` chování jako DT server.
- `ControlPanelService` se NEimplementuje (privátní cluster API).

## 3. Cloud funkce lokálně
- Token flow kompatibilní s `media-generation-kit`: `POST /sdk/token` mock → short JWT → `authenticate` mock → gRPCToken; tier přepínač community/plus (thresholds, fronta).
- Katalog: snapshot `https://models.drawthings.ai/models.json` + naše `cloud-models.json` jako seed `override.models`.
- LoRA BYOL přes `UploadFile` do lokálního CAS.

## 4. Generování – priorita backendů (schváleno 2026-09-06)
- Primární: generování skrze Draw Things API (DT server / DT+ cloud).
- Sekundární: vlastní GPU přes Modal (HTTPS brána, až jako E6).
- Fallback pro dev bez GPU/kreditu: deterministický gradient/noise ze seedu (parafráze FBS `configuration`, timing realistický, cancel okamžitý). Žádný fpzip/python.

## 5. Technika
- `packages/dt-grpc-emu/` v Bun workspaces, server na `@grpc/grpc-js` (stejná serializace jako klient), proto + fbs z `packages/protocol` (žádné duplicity).
- Vlastní CA/cert generované skriptem (`packages/dt-grpc-emu/certs/`), `insecure` profil pro lokální dev.
- Spouštění: `bun --filter @opendraw/dt-grpc-emu dev`, default port 7860 (mimo 7859). `.env` profily: real (DT app) vs emu.

## 6. Fáze
- **E0 kontrakt:** zmrazené tvary + matice testů (echo, exist, upload, generate txt2img/img2img/hints, cancel, thresholds, throttling).
- **E1 handshake + soubory:** Echo, FilesExist, UploadFile CAS, Pubkey, Hours. Ověření `grpcurl` + naše `/api/echo` + přidání serveru v DT app (objeví se modely).
- **E2 generování:** primárně Draw Things API, Modal jako 2. volba, fallback gradient/noise. Ověření end-to-end z naší appky i z DT appky.
- **E3 TLS + auth:** cert chain, sharedSecret, SNI/authority chování. Ověření oběma klienty bez `insecure`.
- **E4 cloud:** token mock, tier přepínač (+ volitelně simulace chyb: 401, fronta, throttling), katalog snapshot, BYOL. Ověření auth flow + lookup + upload.
- **E5 profily a CI:** `.env` real/emu, dokumentace připojení DT appky, smoke test pipeline proti emulátoru.

## 7. Co nedělat
- Ne ControlPanelService, Privacy Pass, billing ani skutečné modely.
- Nesahat na produkční `ssl.cert`, DT DB, `~/Pictures` – vlastní datový dir.
- Neměnit `GrpcPort` kontrakt – server se přizpůsobuje jemu (a DT appce).

## 8. Otevřené volby ke schválení
1. Port (7860?) a `.env` profily real/emu.
2. Fake obrázky: deterministický gradient/noise vs předpřipravené PNG?
3. E4: jen tier přepínač, nebo i simulace chyb (401/fronta/throttling)?
4. Cílová verze DT appky pro kompatibilitu (1.20260716.0?).

## 9. Vlastní GPU přes modal.com (ses_f8d06df63ffep5p5Ej86FSUqtC)
- GPU: T4 ($0.59/h) → L40S ($1.95/h, doporučeno pro diffusion) → A100/H100/H200/B200 ($2.5–6.25/h), účtování po sekundách. Starter $30 kreditů.
- Deploy: Python-first (`modal.App`, `Image`, `@app.cls(gpu=…)`, `modal serve` → `modal deploy`); `@app.server()` pro inference servery; modely do Volumes, scaledown_window/min_containers proti cold startům.
- SÍŤ – ZÁVĚR: nativně jen HTTPS (`*.modal.run`), raw gRPC se stabilním host:port + vlastním TLS cert NEJDE. `modal.forward(h2_enabled=True)` tunel je ephemerální (náhodný host, po restartu jiný) – křehké, nekompatibilní s fixním `DT_HOST:DT_PORT`.
- Možnosti: (a) HTTPS brána před Modalem (naše appka už mluví HTTPS na /api – snadné), (b) tunel + vlastní discovery (křehké), (c) VM s veřejnou IP (RunPod/Lambda/VPS) pro čisté gRPC.
- Doporučení: emulátor lokálně + HTTPS brána na Modal pro GPU inferenci; čisté gRPC na Modal netlačit.

## Stav
- Pozastaveno 2026-09-07: vývoj dt-grpc-emu deaktivován, branch feat/packages/dt-grpc-emu zaparkována lokálně (E4 hotovo, E5 nezadáno), nic z ní se nepushovalo.
- Schváleno 2026-09-06: port 7860, fake gradient/noise, nejprve čistě lokálně (Modal brána až jako E6).
- Hotovo E0+E1 (9d25402), E2 (2bd51dd), E3 (a01b055), E4 (c0c1685).
