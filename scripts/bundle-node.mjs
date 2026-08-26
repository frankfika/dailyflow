#!/usr/bin/env node
/**
 * Download the official Node.js binary for the current platform and place it in
 * dist-server/ so the Tauri app can bundle its own runtime. This avoids relying
 * on the build machine's Node installation (e.g. Homebrew builds link against
 * libnode.dylib and are not portable).
 */
import { createWriteStream, existsSync, mkdirSync, chmodSync, rmSync, copyFileSync } from 'fs';
import { get } from 'https';
import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// DeepSeek Harness requires ^22.19.0 or >=24 (notably node:sqlite).
const NODE_VERSION = '22.19.0';
const distServerDir = join(__dirname, '..', 'dist-server');

const platform = process.platform;
const arch = process.arch;

function platformId() {
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64';
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (platform === 'win32' && arch === 'x64') return 'win-x64';
  throw new Error(`Unsupported platform/arch: ${platform} ${arch}`);
}

function archiveInfo() {
  const id = platformId();
  const ext = platform === 'win32' ? 'zip' : 'tar.gz';
  const archiveName = `node-v${NODE_VERSION}-${id}.${ext}`;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`;
  return { url, archiveName, extractedDir: `node-v${NODE_VERSION}-${id}` };
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Download failed with status ${response.statusCode}: ${url}`));
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.destroy();
      reject(err);
    });
  });
}

function extractArchive(archivePath, extractDir) {
  if (platform === 'win32') {
    // Use PowerShell Expand-Archive on Windows.
    execFileSync('powershell', [
      '-Command',
      `Expand-Archive -Path "${archivePath}" -DestinationPath "${extractDir}" -Force`,
    ], { stdio: 'inherit' });
  } else {
    execFileSync('tar', ['-xzf', archivePath, '-C', extractDir], { stdio: 'inherit' });
  }
}

async function main() {
  mkdirSync(distServerDir, { recursive: true });

  const { url, archiveName, extractedDir } = archiveInfo();
  const archivePath = join(distServerDir, archiveName);
  const extractDir = join(distServerDir, 'node-download');
  const binName = platform === 'win32' ? 'node.exe' : 'node';
  const extractedBinPath = platform === 'win32'
    ? join(extractDir, extractedDir, binName)
    : join(extractDir, extractedDir, 'bin', binName);
  const outputPath = join(distServerDir, binName);

  if (existsSync(outputPath)) {
    try {
      const bundledVersion = execFileSync(outputPath, ['--version'], { encoding: 'utf8' }).trim();
      if (bundledVersion === `v${NODE_VERSION}`) {
        console.log(`Reusing bundled Node runtime ${bundledVersion}: ${outputPath}`);
        return;
      }
    } catch {
      // Replace an unreadable or incompatible runtime below.
    }
  }

  console.log(`Downloading Node ${NODE_VERSION} for ${platformId()}...`);
  console.log(url);

  try {
    await downloadFile(url, archivePath);
  } catch (e) {
    console.error('Failed to download Node binary:', e.message);
    process.exit(1);
  }

  // Clean up any previous extraction.
  if (existsSync(extractDir)) {
    rmSync(extractDir, { recursive: true, force: true });
  }
  mkdirSync(extractDir, { recursive: true });

  try {
    extractArchive(archivePath, extractDir);
  } catch (e) {
    console.error('Failed to extract Node archive:', e.message);
    process.exit(1);
  }

  if (!existsSync(extractedBinPath)) {
    console.error(`Extracted Node binary not found at ${extractedBinPath}`);
    process.exit(1);
  }

  try {
    // Copy to final location.
    copyFileSync(extractedBinPath, outputPath);
  } catch (e) {
    console.error(`Failed to copy Node binary to ${outputPath}:`, e.message);
    process.exit(1);
  }

  if (platform !== 'win32') {
    try {
      chmodSync(outputPath, 0o755);
    } catch (e) {
      console.error('Failed to set executable permissions:', e.message);
      process.exit(1);
    }
  }

  // Clean up downloaded archive and extraction directory.
  try {
    rmSync(archivePath, { force: true });
    rmSync(extractDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup.
  }

  console.log(`Bundled Node runtime: ${outputPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
