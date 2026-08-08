import assert from "node:assert/strict";
import test from "node:test";

import { buildUpdaterManifest } from "./generate-updater-manifest.mjs";

const platforms = [
  ["DailyFlow_1.5.2_aarch64.app.tar.gz", 48_000_000],
  ["DailyFlow_1.5.2_x64.app.tar.gz", 49_000_000],
  ["DailyFlow_1.5.2_x64-setup.exe", 31_000_000],
  ["DailyFlow_1.5.2_amd64.AppImage", 125_000_000],
];

function releaseFixture() {
  const assets = [];
  for (const [name, size] of platforms) {
    assets.push({
      name,
      size,
      browser_download_url: `https://example.test/${name}`,
    });
    assets.push({
      name: `${name}.sig`,
      size: 400,
      browser_download_url: `https://example.test/${name}.sig`,
    });
  }
  return {
    body: "Release notes",
    published_at: "2026-08-09T00:00:00Z",
    assets,
  };
}

test("builds a complete updater manifest after all platform uploads", async () => {
  const manifest = await buildUpdaterManifest(
    releaseFixture(),
    "v1.5.2",
    async () => "signed updater payload with sufficient length",
  );

  assert.equal(manifest.version, "1.5.2");
  for (const key of [
    "darwin-aarch64",
    "darwin-x86_64",
    "windows-x86_64",
    "linux-x86_64",
  ]) {
    assert.match(manifest.platforms[key].url, /^https:\/\//);
    assert.ok(manifest.platforms[key].signature.length > 20);
  }
});

test("fails when a platform signature is missing", async () => {
  const release = releaseFixture();
  release.assets = release.assets.filter(
    (asset) => asset.name !== "DailyFlow_1.5.2_x64-setup.exe.sig",
  );

  await assert.rejects(
    buildUpdaterManifest(release, "v1.5.2", async () => "valid signature payload"),
    /Missing updater signature/,
  );
});

test("fails when an updater asset is unexpectedly small", async () => {
  const release = releaseFixture();
  const appImage = release.assets.find((asset) => asset.name.endsWith(".AppImage"));
  appImage.size = 1024;

  await assert.rejects(
    buildUpdaterManifest(release, "v1.5.2", async () => "valid signature payload"),
    /unexpectedly small/,
  );
});
