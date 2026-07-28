#!/usr/bin/env node
/**
 * Bundle the official native lark-cli binary for the current build platform.
 * The @larksuite/cli postinstall script downloads the matching executable, so
 * release users do not need Node, npm, Homebrew, or a separate CLI install.
 */
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
} from 'fs';
import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const distServerDir = join(projectRoot, 'dist-server');
const sourceName = process.platform === 'win32' ? 'lark-cli.exe' : 'lark-cli';
const sourcePath = join(
  projectRoot,
  'node_modules',
  '@larksuite',
  'cli',
  'bin',
  sourceName,
);
const outputPath = join(distServerDir, sourceName);

function versionOf(binary) {
  return execFileSync(binary, ['--version'], {
    encoding: 'utf8',
    timeout: 15_000,
  }).trim();
}

function main() {
  if (!existsSync(sourcePath)) {
    throw new Error(
      `lark-cli binary is missing at ${sourcePath}. Run npm install so the ` +
      '@larksuite/cli postinstall step can download the platform executable.',
    );
  }

  mkdirSync(distServerDir, { recursive: true });

  if (existsSync(outputPath)) {
    try {
      const currentVersion = versionOf(outputPath);
      const sourceVersion = versionOf(sourcePath);
      if (currentVersion === sourceVersion) {
        console.log(`Reusing bundled ${currentVersion}: ${outputPath}`);
        return;
      }
    } catch {
      // Replace an unreadable or incompatible runtime below.
    }
  }

  copyFileSync(sourcePath, outputPath);
  if (process.platform !== 'win32') chmodSync(outputPath, 0o755);

  console.log(`Bundled ${versionOf(outputPath)}: ${outputPath}`);
}

main();
