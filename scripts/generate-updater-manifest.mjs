#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PLATFORM_SPECS = [
  {
    key: "darwin-aarch64",
    aliases: ["darwin-aarch64-app"],
    assetPattern: /_aarch64\.app\.tar\.gz$/,
    minimumSize: 20_000_000,
  },
  {
    key: "darwin-x86_64",
    aliases: ["darwin-x86_64-app"],
    assetPattern: /_x64\.app\.tar\.gz$/,
    minimumSize: 20_000_000,
  },
  {
    key: "windows-x86_64",
    aliases: ["windows-x86_64-nsis"],
    assetPattern: /_x64-setup\.exe$/,
    minimumSize: 20_000_000,
  },
  {
    key: "linux-x86_64",
    aliases: ["linux-x86_64-appimage"],
    assetPattern: /_amd64\.AppImage$/,
    minimumSize: 80_000_000,
  },
];

export async function buildUpdaterManifest(release, tag, fetchText) {
  const version = tag.replace(/^v/, "");
  const platforms = {};

  for (const spec of PLATFORM_SPECS) {
    const asset = release.assets.find((candidate) =>
      spec.assetPattern.test(candidate.name),
    );
    if (!asset) {
      throw new Error(`Missing updater asset for ${spec.key}`);
    }
    if (asset.size < spec.minimumSize) {
      throw new Error(
        `Updater asset for ${spec.key} is unexpectedly small: ${asset.size} bytes`,
      );
    }

    const signatureAsset = release.assets.find(
      (candidate) => candidate.name === `${asset.name}.sig`,
    );
    if (!signatureAsset) {
      throw new Error(`Missing updater signature for ${asset.name}`);
    }

    const signature = (await fetchText(signatureAsset.browser_download_url)).trim();
    if (signature.length < 20) {
      throw new Error(`Updater signature for ${asset.name} is empty or invalid`);
    }

    const entry = {
      signature,
      url: asset.browser_download_url,
    };
    platforms[spec.key] = entry;
    for (const alias of spec.aliases) {
      platforms[alias] = entry;
    }
  }

  return {
    version,
    notes: release.body ?? "",
    pub_date: release.published_at ?? new Date().toISOString(),
    platforms,
  };
}

async function githubRequest(url, token, accept = "application/vnd.github+json") {
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status}): ${url}`);
  }
  return response;
}

async function main() {
  const [repository, tag, output] = process.argv.slice(2);
  const token = process.env.GH_TOKEN;
  if (!repository || !tag || !output) {
    throw new Error(
      "Usage: generate-updater-manifest.mjs <owner/repo> <tag> <output>",
    );
  }
  if (!token) {
    throw new Error("GH_TOKEN is required");
  }

  const releaseResponse = await githubRequest(
    `https://api.github.com/repos/${repository}/releases/tags/${tag}`,
    token,
  );
  const release = await releaseResponse.json();
  const manifest = await buildUpdaterManifest(release, tag, async (url) => {
    const response = await githubRequest(url, token, "application/octet-stream");
    return response.text();
  });

  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Generated updater manifest ${output} with ${Object.keys(manifest.platforms).length} platform entries.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
