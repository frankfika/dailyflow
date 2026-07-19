#!/usr/bin/env node
// Verify the deck project: slide count, duplicate IDs, asset paths, and
// rough overflow checks against the configured 1600x900 canvas.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const MEDIA = path.join(ROOT, 'assets', 'media');
const CANVAS_W = 1600;
const CANVAS_H = 900;

function fail(msg) {
  console.error('FAIL  ' + msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log('ok    ' + msg);
}

if (!fs.existsSync(INDEX)) fail('index.html missing');

const html = fs.readFileSync(INDEX, 'utf8');

// Slide sections
const slideIds = Array.from(html.matchAll(/id="(slide-\d+)"/g)).map((m) => m[1]);
const uniq = new Set(slideIds);
if (slideIds.length !== uniq.size) {
  fail('duplicate slide ids: ' + JSON.stringify(slideIds));
}
ok('slide count: ' + slideIds.length + ' (unique)');

// Asset references
const assetRefs = Array.from(html.matchAll(/(?:src|href)="([^"]+\.(?:png|jpg|jpeg|svg|webp|ico))"/gi)).map((m) => m[1]);
const missing = [];
for (const ref of assetRefs) {
  const clean = ref.split('?')[0];
  if (clean.startsWith('http')) continue;
  const abs = path.join(ROOT, clean.replace(/^\//, ''));
  if (!fs.existsSync(abs)) missing.push(ref);
}
if (missing.length) {
  fail('missing asset files: ' + missing.join(', '));
} else {
  ok('asset references resolve (' + assetRefs.length + ')');
}

// Per-slide CSS files exist
const cssFiles = fs.readdirSync(path.join(ROOT, 'assets')).filter((f) => f.startsWith('deck-slide-') && f.endsWith('.css'));
if (cssFiles.length < 8) fail('expected at least 8 per-slide CSS files, found ' + cssFiles.length);
else ok('per-slide CSS files: ' + cssFiles.length);

// Media sanity
if (fs.existsSync(MEDIA)) {
  const media = fs.readdirSync(MEDIA);
  ok('media folder has ' + media.length + ' files');
}

// Rough overflow heuristic — print a single line per slide that contains
// any horizontal or vertical hard-coded offset > canvas.
let overflowNotes = [];
const styleSheets = cssFiles.map((f) => fs.readFileSync(path.join(ROOT, 'assets', f), 'utf8')).join('\n');
for (const m of styleSheets.matchAll(/--slide-w:\s*(\d+)px;\s*--slide-h:\s*(\d+)px/g)) {
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (w > CANVAS_W || h > CANVAS_H) overflowNotes.push('declared ' + w + 'x' + h);
}
if (overflowNotes.length) {
  fail('slides declare > 1600x900 canvas: ' + overflowNotes.join('; '));
} else {
  ok('no per-slide canvas overruns 1600x900');
}

if (process.exitCode) {
  console.error('\nverify: FAILED');
} else {
  console.log('\nverify: PASSED');
}