# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

《卫戍协议：盟约》(Stronghold Protocol: Alliance) — an unofficial, non-commercial fan remake of Arknights' seasonal auto-chess tower-defense mode. A Node.js server + browser client; 1–4 player co-op. Code is GPL-3.0-or-later, but **game assets (art/audio/data) are NOT covered** by that license (© Hypergryph/Yostar) and are not in this repo — see `NOTICE.md`.

Note the documentation convention: prose/docs are Simplified Chinese, code and comments are English.

## This copy is a release bundle

This directory is the shipped bundle (it contains `MANIFEST.json`, and has no `.git`), **not** the full source repo. That means:

- Dev-only tools and tests are stripped: no `test/`, no `tools/{build-data,golden,package,ci,check-imports}.mjs`, no `docs/{ARCHITECTURE,DESIGN,SIM,META,...}.md`.
- Only production dependencies are installed (`npm ci --omit=dev`): `htm`, `pixi.js`, `pixi-spine`, `preact`, `three`, `ws`. `eslint`, `typescript`, `puppeteer-core` are absent.
- The full source is at https://github.com/sganggs/Stronghold-Protocol.

Consequently, `npm` scripts that depend on the missing tools/deps will not run here. The scripts that *do* work in this bundle: `start`, `dev`, `setup`, `doctor`, `assets`, `vendor`, `launch`, `postinstall`. The rest (`test`, `golden`, `build-data`, `lint`, `typecheck`, `check:imports`, `ci`, `package`) require the source repo.

## Commands

Node 22 or 24 required. ESM project (`"type": "module"`); **no build step** — the browser loads native ES modules straight from `public/`.

- `npm start` — run the server (`node server/index.js`); serves at http://localhost:3000
- `npm run dev` — `node --watch server/index.js` (auto-restart on server-code change)
- `npm run setup` — env check + download ~550 MB of assets from public mirrors (`tools/setup.mjs`, resumable)
- `npm run doctor` — read-only diagnostics (Node version, asset completeness, port, LAN address, firewall) via `tools/doctor.mjs`
- `npm run vendor` — copy front-end libs from `node_modules` into `public/vendor/` (`tools/vendor.mjs`; auto-runs on `postinstall`)
- `npm run assets` — `vendor` + `fetch-assets.mjs` (download assets)
- `npm run launch` — `scripts/launch.mjs`
- Windows quick start: `scripts\start-windows.bat` (macOS/Linux: `scripts/start.sh`)

Config via env vars: `PORT` (default 3000), `HOST` (default `::` dual-stack), `SP_COMBAT` (`client`|`server`), `SP_VERIFY` (`off`|`sample`|`all`), `TRUST_PROXY`, `DEBUG`, `SP_NO_BROWSER`, `SP_BOT_EMOTES`. Health check: `GET /healthz`.

Source-repo-only scripts (not available here): `npm test` (`node --test`), `npm run golden` / `golden:update` (`tools/golden.mjs` — a refactor that doesn't change gameplay must not alter `test/golden/*.json`), `npm run lint`, `npm run typecheck`, `npm run build-data`, `npm run package` / `package:lite`.

## Architecture

No bundler anywhere — three top-level slices:

- `server/` — the Node HTTP + WebSocket server. Entry `server/index.js`. `http/` (static file serving + `/ws` websocket), `lobby.js` (rooms), `match/` (match engine: turns, economy, shop, 盟约 bands, final assault), `sim/` (the battle simulator), `net.js` (protocol/messages), `packs.js` (content packs), `update.js` (update-package verification against `MANIFEST.json`).
- `shared/` — code imported by **both** server and browser: `constants.js`, `protocol.js` (network message types), i18n, packs, loadout/potential helpers.
- `public/` — the browser client, native ES modules. `public/js/main.js` entry; `net.js` (ws client); `battle/` (`runner.js` + `observe.js`); `render/` (PixiJS board, three.js 3D board, Preact + htm UI); `screens/` (CSS + JS per screen); `store.js` (client state); `pwa.js` (PWA/service worker). Static assets in `public/assets/`, fonts in `public/fonts/`, i18n strings in `public/i18n/`.
- `data/` — generated game data (operators, enemies, bands, etc.) plus `assets.json` (asset manifest). **Regenerate via `tools/build-data.mjs` in the source repo; never hand-edit `data/*.json`.**
- `tools/` / `scripts/` — runtime tools (setup, doctor, fetch-assets, vendor, local-extract) and startup scripts.

Key facts that require reading across files to see:

- **Combat is simulated in each player's browser by default.** The battle simulator lives in `server/sim/`, but `shared/`/`sim` code is imported by the client, so each player simulates their own battle; the server only runs the lobby, economy, round flow, and (optionally) AI/disconnected players' battlefields. `SP_COMBAT=server` moves sim server-side; `SP_VERIFY` makes the server re-simulate client-reported results.
- **The server is stateful and in-memory**: rooms/matches exist only in RAM, no database. Restarting the server ends every match (including solo games that would otherwise be resumable for 24 h).
- **Must be served at the domain root**: the client uses absolute `/data/`, `/vendor/`, `/ws` paths, so it can't be mounted under a sub-path. Reverse proxies must forward the `/ws` WebSocket upgrade. Serverless/static hosts don't work — it's one long-lived Node process + WebSocket.
- **Assets are not in the repo** (gitignored): downloaded by `setup`/`fetch-assets` into `public/assets/` + `public/fonts/`. `data/assets.json` is the manifest of what's expected; missing files fall back to placeholders at runtime.
- **Front-end libs are vendored, not bundled**: `tools/vendor.mjs` copies pixi.js, pixi-spine, three.js, preact, htm into `public/vendor/` for the browser to load as `<script type="module">`.
- **i18n**: adding a language = drop a JSON file in `public/i18n/`; game text (from official client data) lives in `data/i18n/`. `shared/i18n.js` handles lookup.

See `README.md` (overview + run instructions), `docs/PLAYING.md` (gameplay rules), and `docs/DEPLOY.md` (deployment: firewall, tunnels, reverse proxy, Docker) for details not repeated here.

## Local modification (mobile/APK build)

`server/http/config.js` — `ROOT` now reads `process.env.SP_ROOT` first, so the served trees (`public/ data/ shared/ packs/`, and `server/sim/` for `/sim/`) can live under a mobile bundle root instead of this repository layout. This is a benign, backward-compatible override (unset → the original `import.meta.url`-based path). See the APK build project at `D:\apk-build\` (`README.md` there) for the offline-APK packaging.
