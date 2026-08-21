#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const raw = process.argv[2];
if (!raw) {
  console.error('Usage: node scripts/bump-version.mjs <version>');
  console.error('Example: node scripts/bump-version.mjs 0.3.0');
  process.exit(1);
}

const version = raw.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) {
  console.error(`Invalid version: ${version} (expected semver like 0.3.0)`);
  process.exit(1);
}

function updateJson(path, mutate) {
  const full = resolve(root, path);
  const json = JSON.parse(readFileSync(full, 'utf8'));
  mutate(json);
  writeFileSync(full, JSON.stringify(json, null, 2) + '\n');
  console.log(`  ${path} -> ${version}`);
}

function updateCargoToml(path) {
  const full = resolve(root, path);
  const text = readFileSync(full, 'utf8');
  const next = text.replace(
    /^(version\s*=\s*")[^"]+(")/m,
    `$1${version}$2`,
  );
  if (next === text) {
    console.error(`  ${path}: no version field updated (check format)`);
    process.exit(1);
  }
  writeFileSync(full, next);
  console.log(`  ${path} -> ${version}`);
}

function replaceChecked(path, pattern, replacement) {
  const full = resolve(root, path);
  const text = readFileSync(full, 'utf8');
  const next = text.replace(pattern, replacement);
  if (next === text) {
    console.error(`  ${path}: expected version marker was not found`);
    process.exit(1);
  }
  writeFileSync(full, next);
  console.log(`  ${path} -> ${version}`);
}

console.log(`Bumping version to ${version}`);
updateJson('package.json', (j) => { j.version = version; });
updateJson('package-lock.json', (j) => {
  j.version = version;
  if (j.packages?.['']) j.packages[''].version = version;
});
updateJson('src-tauri/tauri.conf.json', (j) => { j.version = version; });
updateJson('.release-please-manifest.json', (j) => { j['.'] = version; });
updateCargoToml('src-tauri/Cargo.toml');
replaceChecked(
  'src-tauri/Cargo.lock',
  /(\[\[package\]\]\s*\nname = "dailyflow"\s*\nversion = ")[^"]+("\s*\n)/,
  `$1${version}$2`,
);
replaceChecked(
  'README.md',
  /(当前稳定版：v)[^*\s]+/,
  `$1${version}`,
);

console.log('\nNext steps:');
console.log(`  1. Review the diff: git diff`);
console.log(`  2. Commit:          git commit -am "chore: bump version to ${version}"`);
console.log(`  3. Tag:             git tag v${version}`);
console.log(`  4. Push:            git push && git push --tags`);
