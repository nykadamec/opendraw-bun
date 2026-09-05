# F0 kontrakt – co bylo zkopírováno beze změny

Zdroj: `../opendraw/` (jen čtení, ověřeno `diff -r`, vše byte-identické).

| Zdroj (staré repo) | Cíl (opendraw-bun) | Poznámka |
|---|---|---|
| `frontend/src/shared/api/client.ts` | `packages/api-client/src/client.ts` | API klient 1:1, základ `/api` |
| `frontend/src/shared/types.ts` | `packages/api-client/src/types.ts` | Sdílené typy 1:1 |
| `proxy/src/cloud-models.json` | `apps/server/src/cloud-models.json` | viz rozhodnutí níže |
| `proxy/src/proto/` (celé: `controlPanel.proto`, `imageService.proto`, `fbs/*.fbs`, `fbs/ts/*.ts`, 50 souborů) | `packages/protocol/proto/` (stejná struktura) | Wire protokol DT |

## Rozhodnutí

- **`cloud-models.json → apps/server/src/`** (ne `packages/protocol`): je to datový soubor servrované routy
  `/api/cloud-models`, ne wire protokol (proto/fbs). Server je jeho jediný vlastník/čtenář.
- **`proxy/src/fbs/` neexistuje samostatně** – fbs schémata (`*.fbs`) i generované TS (`fbs/ts/*.ts`)
  žijí v `proxy/src/proto/fbs/`; zkopírováno celé `proto/` včetně nich, struktura zachována.
- **`samplers.ts`, `dt-tensor.ts`, `fbs-config.ts` se v F0 nekopírují** – patří až k F4 (generate).
  Stejně tak `grpc-client.ts`, storage a další services mají zatím jen prázdné složky.
