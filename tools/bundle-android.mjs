#!/usr/bin/env node
// tools/bundle-android.mjs — package server, shared, data, public, packs and node_modules
// into android/app/src/main/assets/app_bundle.zip for the native Android shell (NodeServerService).
//
// This is a trimmed port of Paper-Yuan/Stronghold-Protocol's bundler, adapted to the v0.2.4
// release bundle: no fork-specific voices-manifest gate, and `packs/` (content packs) is included.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID_ASSETS_DIR = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets');
const ZIP_TARGET = path.join(ANDROID_ASSETS_DIR, 'app_bundle.zip');
const STAGING_DIR = path.join(ROOT, '.cache', 'android-bundle-staging');

console.log('[bundle-android] Preparing Android app_bundle...');

// 1. Ensure vendor files (public/vendor) are present
const vendorRes = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'vendor.mjs')], { stdio: 'inherit' });
if (vendorRes.status !== 0) {
  console.error('[bundle-android] vendor.mjs failed');
  process.exit(1);
}

// 2. Prepare staging directory
if (fs.existsSync(STAGING_DIR)) fs.rmSync(STAGING_DIR, { recursive: true, force: true });
fs.mkdirSync(STAGING_DIR, { recursive: true });

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) copyRecursive(path.join(src, file), path.join(dest, file));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// 3. Copy server, shared, data, public, packs and the package manifest
for (const d of ['server', 'shared', 'data', 'public', 'packs']) {
  console.log(`[bundle-android] Copying ${d}/ ...`);
  copyRecursive(path.join(ROOT, d), path.join(STAGING_DIR, d));
}
copyRecursive(path.join(ROOT, 'package.json'), path.join(STAGING_DIR, 'package.json'));

// 4. Bundle root licenses and notices for in-app distribution (GPL requires shipping the text)
console.log('[bundle-android] Bundling distribution licenses and notices...');
const licensesStaging = path.join(STAGING_DIR, 'licenses');
fs.mkdirSync(licensesStaging, { recursive: true });
if (fs.existsSync(path.join(ROOT, 'LICENSE'))) {
  fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(licensesStaging, 'LICENSE.txt'));
}
if (fs.existsSync(path.join(ROOT, 'NOTICE.md'))) {
  fs.copyFileSync(path.join(ROOT, 'NOTICE.md'), path.join(licensesStaging, 'NOTICE.txt'));
}
if (fs.existsSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.md'))) {
  fs.copyFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.md'), path.join(licensesStaging, 'THIRD-PARTY-NOTICES.txt'));
  const publicLicenses = path.join(STAGING_DIR, 'public', 'licenses');
  fs.mkdirSync(publicLicenses, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.md'), path.join(publicLicenses, 'THIRD-PARTY-NOTICES.txt'));
}

// 5. Set Android bundle engines to >=18 for the embedded libnode 18.20.4 runtime
const bundledPkgPath = path.join(STAGING_DIR, 'package.json');
if (fs.existsSync(bundledPkgPath)) {
  const pkgData = JSON.parse(fs.readFileSync(bundledPkgPath, 'utf8'));
  pkgData.engines = { node: '>=18' };
  fs.writeFileSync(bundledPkgPath, JSON.stringify(pkgData, null, 2), 'utf8');
}

// 6. Copy only necessary production node_modules
console.log('[bundle-android] Copying production node_modules (ws, preact, htm, pixi.js, pixi-spine, three)...');
const prodModules = ['ws', 'preact', 'htm', 'pixi.js', 'pixi-spine', 'three'];
fs.mkdirSync(path.join(STAGING_DIR, 'node_modules'), { recursive: true });
for (const mod of prodModules) {
  const modPath = path.join(ROOT, 'node_modules', mod);
  if (fs.existsSync(modPath)) {
    copyRecursive(modPath, path.join(STAGING_DIR, 'node_modules', mod));
  } else {
    console.warn(`[bundle-android] WARNING: node_modules/${mod} missing (client will fall back to placeholders)`);
  }
}

// 7. Compress into app_bundle.zip via python zipfile (compresslevel=1: fast on already-compressed media)
fs.mkdirSync(ANDROID_ASSETS_DIR, { recursive: true });
console.log(`[bundle-android] Creating zip archive at ${ZIP_TARGET} (this can take a few minutes)...`);
const pyScript = `
import zipfile, os, sys
staging = sys.argv[1]; target = sys.argv[2]
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, allowZip64=True, compresslevel=1) as z:
    for root, dirs, files in os.walk(staging):
        for file in files:
            full = os.path.join(root, file)
            rel = os.path.relpath(full, staging)
            z.write(full, rel)
print('Compressed', target)
`;
const zipRes = spawnSync('python', ['-c', pyScript, STAGING_DIR, ZIP_TARGET], { stdio: 'inherit' });
if (zipRes.status !== 0) {
  console.error('[bundle-android] Failed to compress staging directory');
  process.exit(1);
}

// Clean up staging
fs.rmSync(STAGING_DIR, { recursive: true, force: true });
const stats = fs.statSync(ZIP_TARGET);
console.log(`[bundle-android] app_bundle.zip generated: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

// 8. Generate bundle.sha256 version marker for the Android asset extractor
const zipBuffer = fs.readFileSync(ZIP_TARGET);
const hash = crypto.createHash('sha256').update(zipBuffer).digest('hex');
const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const versionContent = `${rootPkg.version}-${hash.slice(0, 16)}`;
const versionFile = path.join(ANDROID_ASSETS_DIR, 'bundle.sha256');
fs.writeFileSync(versionFile, versionContent, 'utf8');
console.log(`[bundle-android] Generated bundle.sha256: ${versionContent}`);

console.log('[bundle-android] Done!');
