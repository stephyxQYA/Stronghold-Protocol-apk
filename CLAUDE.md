# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
Upstream's own entry point is `AGENTS.md` (what to read first, the hard rules, how to verify) — read it too.

## What this is

《卫戍协议：盟约》(Stronghold Protocol: Alliance) — an unofficial, non-commercial fan remake of Arknights' seasonal auto-chess tower-defense mode. A Node.js server + browser client; 1–4 player co-op. Code is GPL-3.0-or-later, but **game assets (art/audio/data) are NOT covered** by that license (© Hypergryph/Yostar) and are not in this repo — see `NOTICE.md`.

Note the documentation convention: prose/docs are Simplified Chinese, code and comments are English.

## What this copy is: the Android (APK) fork

Working copy `D:\Stronghold-Protocol`, branch `main`, published at https://github.com/stephyxQYA/Stronghold-Protocol-apk (public). Upstream, without the Android shell, is https://github.com/sganggs/Stronghold-Protocol (branch `master`).

- **Synced from upstream v0.2.6 on 2026-10-15** (was v0.2.4). The sync kept every local patch below; the helper scripts live in `.upstream/` (git-ignored) and `.upstream/sync-0.2.6.ps1` documents the whole procedure for the next version bump.
- `android/` is the **native Android shell** — a trimmed port of the fork Paper-Yuan/Stronghold-Protocol by @Paper-Yuan — embedding Node.js `libnode.so` **18.20.4** and `libc++_shared.so` (arm64-v8a + x86_64) so a phone serves the game offline.
- Build: `node scripts/build-android.mjs` (debug) or `--release` (needs `SP_STORE_FILE`/`SP_STORE_PASSWORD`/`SP_KEY_ALIAS`/`SP_KEY_PASSWORD` in `android/local.properties` or the environment) → `android/app/build/outputs/apk/debug/app-debug.apk`. It runs `tools/bundle-android.mjs` first, which zips `server/ shared/ data/ public/ packs/ package.json` + prod deps into `android/app/src/main/assets/app_bundle.zip` (+ `bundle.sha256`).
- **Any change under `public/ server/ shared/ data/` only reaches the phone after a rebuild.** Never bundle with esbuild: the server uses runtime `await import('./ops/'+file)` and top-level await, which CJS cannot express. `SP_ANDROID_STAGING` overrides the bundler's staging directory (default `.cache/android-bundle-staging`).
- **Keep `applicationId` (`com.paper.stronghold`, `.debug` suffix for debug builds), the signing key and an increasing `versionCode`.** An Android upgrade installs over the old app and keeps its data — the player's 战绩 / 干员调配 / 持有 / 自选编队 / 设置 all live in the WebView's localStorage for origin `http://127.0.0.1:3000`, inside the app's private data dir. Changing the package name or the signing key (e.g. shipping release over a debug install) turns it into a different app and loses all of it. Current: `versionCode 26`, `versionName "0.2.6"`.
- Node version tension: upstream declares `engines: node >= 22`, but the APK embeds **18.20.4** (nodejs-mobile's latest) and `bundle-android.mjs` rewrites the bundled `package.json` to `>=18`. v0.2.6 was verified on 18.20.4 with a full bot match plus engine audit (`.upstream/smoke-0.2.6.mjs`, `node tools/matchrun.mjs --check`). Re-run that check after any version bump.
- Art is complete and current: `data/assets.json` is byte-identical to upstream's and all 10,956 of its paths are on disk; the committed `data/local-assets.json` lists **1,658 entries** extracted from the local Arknights client on 2026-10-15, including **all eleven official battlefield scenes** (`public/assets/local/scene/`, 61 MB: `scene/act1autochess_m01…m07` + `act2autochess_m01…m04`) and the how-to-play pages as WebP.
- Re-extracting that art on this machine: `node tools/setup.mjs --local --scenes -y --game "D:\Hypergryph Launcher\games\Arknights Game\Arknights_Data\StreamingAssets\AB\Windows"`. Two traps: the client auto-detection misses this install (its folder is `Arknights Game`; the candidate list looks for `Arknights`), and **the extractor's venv must live outside the repo** — `D:\Stronghold-Protocol-local\venv-extract`, linked back as `.venv-extract`. A `python.exe` that physically sits in the workspace inherits the sandbox's Low integrity label, so it can write to neither `%TEMP%` nor `public/assets/local`: pip then dumps `pip-unpack-*`/`pip-metadata-*` junk into the repo root and the extraction silently produces nothing.
- `MANIFEST.json` is deliberately absent: it is a release-bundle artifact (update packages verify against it), and a source checkout has none. `server/update.js` only consults it when a pending `UPDATE.json` exists. `npm run package` regenerates it.
- Dev tooling: `tools/` is synced from upstream (build-data, golden, ci, package, simrun, matchrun…), but **`test/` and `.github/` are not**, and only production dependencies are installed — so `npm test`, `npm run lint`, `npm run typecheck` do not run here. Node 22/24 is still required on the dev machine (`npm start` etc.).
- **Local-only bulk lives outside the repo**, in `D:\Stronghold-Protocol-local\` (see its `README.md`): the built APKs, the superseded Capacitor project, the Paper-Yuan reference clone, session backups, and — through **directory junctions** — this repo's `.upstream\`, `.cache\`, `android\app\build\`, `android\build\`, `android\.gradle\` and `android\app\src\main\assets\`. Every path keeps working unchanged through those links; `node_modules\` and `public\assets\` deliberately stay in the repo, because `npm ci` replaces whole directories and would swap a junction for a real one. Deleting a junction removes only the link.

## Local patches this fork carries — re-apply after an upstream sync

Server:

- `server/http/config.js` — `ROOT` reads `process.env.SP_ROOT` first, so the served trees can live under a mobile bundle root.
- `server/http/routes.js` — `isPrivateAddress()` + the `GET /lan/room` probe (private peers only) that the shell's LAN room finder calls.

Client (Android shell integration):

- `public/js/main.js` — `reportClientState()`, the page's self-report to `AndroidNative` (the native blank-screen watchdog has no other way to hear from a WebView whose surface is dead).
- `public/js/ui/settings.js` — the native "本机服务" row (服务器设置 / 重启引擎 / 运行日志 / 重载页面).
- `public/js/screens/lobby.js` — LAN room discovery (`AndroidNative.findRoom` → `globalThis.__onRoomFound` → `connectToHost`).

Client (the 休整期 map-size feature, approved 2026-10-12):

- `public/js/render/app.js` — pinch-to-zoom (camBase / derived-cam split) and its reset in `enterBattle()`.
- `public/css/screens/game-shop.css` — `--shop-card-h`.
- `public/js/ui/fieldHost.js` — `shopBarTopCoarse`.

Fork-only files (upstream has none of these): the whole `android/` shell, `scripts/build-android.mjs`, `tools/bundle-android.mjs`, `tools/make-icon.mjs` + `tools/icon-src.png`, committed `data/local-assets.json` and `packs/index.json`, plus the Android sections in `README.md` / `CHANGELOG.md` and the shell attribution in `NOTICE.md` / `THIRD-PARTY-NOTICES.md`. The launcher icon is generated by `tools/make-icon.mjs` from `tools/icon-src.png` and is final — do not redesign it unbidden.

## Commands

Node 22 or 24 required to develop. ESM project (`"type": "module"`); **no build step** — the browser loads native ES modules straight from `public/`.

- `npm start` — run the server (`node server/index.js`); serves at http://localhost:3000
- `npm run dev` — `node --watch server/index.js`
- `npm run setup` — env check + download ~550 MB of assets from public mirrors (resumable)
- `npm run doctor` — read-only diagnostics (node version, asset completeness, port, LAN address, firewall)
- `npm run vendor` — copy front-end libs from `node_modules` into `public/vendor/` (auto-runs on `postinstall`)
- `npm run assets` — `vendor` + asset download
- `npm run launch` — `scripts/launch.mjs`
- Windows quick start: `scripts\start-windows.bat` (macOS/Linux: `scripts/start.sh`)
- `node tools/matchrun.mjs --mode solo --difficulty NORMAL --seed 3 --check --errors` — headless full match with the engine audit; the fastest "does the sim still work" gate

Config via env vars: `PORT` (default 3000), `HOST` (default `::` dual-stack), `SP_COMBAT` (`client`|`server`), `SP_VERIFY` (`off`|`sample`|`all`), `TRUST_PROXY`, `DEBUG`, `SP_NO_BROWSER`, `SP_BOT_EMOTES`, `SP_ROOT` (bundle root), `SP_ANDROID_STAGING`. Health check: `GET /healthz` (`?traffic=1` on a LAN/local peer adds the traffic counters).

## Architecture

No bundler anywhere — three top-level slices (see `docs/ARCHITECTURE.md` for the full map):

- `server/` — the Node HTTP + WebSocket server. Entry `server/index.js`. `http/` (static files, `/ws`, asset index + hashed manifest views, traffic counters), `lobby.js` (rooms), `match/` (turns, economy, shop, 盟约 bands, final assault), `sim/` (the battle simulator), `net.js` (protocol), `packs.js` (content packs), `update.js` (update-package verification).
- `shared/` — imported by **both** server and browser: `constants.js`, `protocol.js`, i18n, packs, loadout/potential helpers, `assetPaths.js`.
- `public/` — the browser client, native ES modules: `js/main.js` entry, `net.js`, `battle/`, `render/` (PixiJS board, three.js 3D board, Preact + htm UI), `screens/`, `css/`, `dev/` (dev pages), `store.js`, `pwa.js`; art in `public/assets/`, fonts in `public/fonts/`, i18n in `public/i18n/`.
- `data/` — generated game data plus `assets.json` (art manifest). **Regenerate with `npm run build-data`; never hand-edit `data/*.json`.**
- `docs/` — upstream's design/history/reference documentation (Chinese prose).

Key facts that require reading across files to see:

- **Combat is simulated in each player's browser by default.** `server/sim/` is plain deterministic ESM imported by the client too, so each player simulates their own battle; the server runs the lobby, economy, round flow and (optionally) AI/disconnected battlefields. `SP_COMBAT=server` moves the sim server-side; `SP_VERIFY` re-simulates client-reported results.
- **The server is stateful and in-memory**: rooms/matches live in RAM only, no database. Restarting ends every match.
- **Must be served at the domain root**: the client uses absolute `/data/`, `/vendor/`, `/ws` paths. Reverse proxies must forward the `/ws` upgrade. No serverless/static hosting.
- **Assets are not in the repo** (git-ignored): `setup` downloads them; `data/assets.json` is the manifest; missing files fall back to placeholders. 0.2.6+ serves art URLs with a content-hash segment and caches them for a year.
- **Front-end libs are vendored, not bundled** (`tools/vendor.mjs` → `public/vendor/`).
- **i18n**: a language is a JSON file in `public/i18n/`; game text lives in `data/i18n/`; lookups go through `shared/i18n.js`, UI strings through `t('…')`.
- **Sim determinism is a hard rule**: `server/sim/` has no Node APIs, no `Math.random`, no clocks, and no engine-approximated math (`server/sim/detmath.js`; enforced upstream by ESLint and tests).

## Where the live status lives

This file holds architecture, rules and the fork's patch inventory — never progress. Per-session state and pitfalls live in Claude Code's auto memory for this repo: `~/.claude/projects/D--Stronghold-Protocol/memory/` (`MEMORY.md` index plus topic files). Released changes are in `CHANGELOG.md`; upstream's design rationale is under `docs/`. Read those before assuming what is already done.
