# AGENTS.md – opendraw-bun (Bun monorepo)

Bun workspaces `apps/*` + `packages/*`, jeden `bun.lock`. Vše přes `bun` – nikdy `npm` (jiný lockfile).

## Příkazy (z rootu)

- Install: `bun install`. Dev vše: `bun dev` (= `bun scripts/dev.ts [--port XXXX] [--public]`).
- Sólo: `bun --filter @opendraw/server dev` (hot), `.../desktop dev`, `.../mobile dev`.
- Server start/stop: `./server-start.sh [--port] [--public]` / `./server-stop.sh` (PID/log `/tmp/opendraw-bun-server.{pid,log}`).
- Build: `bun build` (= ui → backend → web, pořadí dodržet); dílčí `build:ui`, `build:backend`, `build:web` (flagy `--desktop-only`, `--skip-*`, `--dry-run`).
- Typecheck: `bunx tsc --noEmit -p packages/{api-client,config-theme,ui}/tsconfig.json`, `bunx tsc -p apps/server/tsconfig.json`.

## Architektura

- Server Hono default `http://localhost:3001` (`HOST`/`PORT` env, `--public`=0.0.0.0) + `/api/health`; desktop Vite `:5173`, mobile `:5174`, oba proxyují `/api` na server.
- Draw Things externě: gRPC `DT_HOST:DT_PORT` (default 127.0.0.1:7859) + TLS cert + `DT_API_KEY`; modely/DT data default `~/Library/Containers/com.liuliu.draw-things/…`.
- `apps/server` (routes, services, `config.ts` jediný zdroj env, `cloud-models.json`) – sem nová API logika. `apps/desktop|mobile` jen tenký App/main + index.html + vite.config (`MODE`).
- `packages/api-client` (fetch `/api` + typy), `packages/ui` (komponenty/stránky, importy jen `@opendraw/*`), `packages/protocol` (proto/fbs wire formát), `packages/config-theme` (tokeny, ThemeContext, `vite-base.ts`, `public/` s manifestem).

## Quirks

- Tailwind v4 CSS-first: utility pro `packages/ui` vznikají jen díky `@source` v `config-theme/src/index.css` – nemazat. `@theme inline` je nutný pro přepínání `[data-theme]` bez rebuildu.
- `publicDir` je sdílený (`config-theme/public`) + `realpathSync` dereference symlinku – jinak Vite public tiše přeskočí. Žádné vlastní `public/` v apps (duplicitní manifest).
- `bun:sqlite` vrací BLOB jako `Uint8Array` – normalizovat na `Buffer`.
- Cesty vždy přes `resolveEnvPath` (trim + `~` + cwd), nikdy absolutní literál s uživatelem; `.env` se necommituje.
- Generované `packages/protocol/proto/fbs/ts/*` se needitují a negenerují znovu.

## Zákazy

- Žádná live generace (drahá); povolen max smoke s cloud `krea_2_turbo_q8p.ckpt`.
- Produkční DT DB jen číst (readonly + busy_timeout + retry), nikdy zapisovat; galerii/canvas testovat na kopiích.
