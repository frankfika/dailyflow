#!/usr/bin/env node
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(projectRoot, 'dist-server', 'dsh');
const outputModules = path.join(outputRoot, 'node_modules');
const sourceModules = path.join(projectRoot, 'node_modules');
const profileSource = path.join(projectRoot, 'server', 'services', 'harness', 'dsh-profile');

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputModules, { recursive: true });
const roots = [
  '@deepseek-ai/dsh-acp-demo', '@deepseek-ai/dsh-llm-pi-ai',
  '@deepseek-ai/dsh-subprocess-local', '@deepseek-ai/dsh-bash-local', '@deepseek-ai/dsh-tools',
];
const dependencyPaths = collectClosure(roots);

for (const source of dependencyPaths) {
  const relative = path.relative(sourceModules, source);
  const destination = path.join(outputModules, relative);
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, dereference: true });
}
cpSync(profileSource, path.join(outputRoot, 'profile'), { recursive: true });

const required = ['@deepseek-ai/dsh', '@deepseek-ai/dsh-acp-demo', '@deepseek-ai/dsh-llm-pi-ai'];
// The CLI package is probed for the pinned distribution version but is not the
// executable used by DailyFlow (ACP demo is); copying it shallow avoids pulling
// unrelated web/MCP/workflow bundles into the desktop release.
cpSync(path.join(sourceModules, '@deepseek-ai', 'dsh'), path.join(outputModules, '@deepseek-ai', 'dsh'), { recursive: true, dereference: true });
const versions = Object.fromEntries(required.map(name => {
  const json = JSON.parse(readFileSync(path.join(outputModules, name, 'package.json'), 'utf8'));
  if (json.version !== '0.1.1-rc.2') throw new Error(`${name} must be exactly 0.1.1-rc.2, got ${json.version}`);
  return [name, json.version];
}));
writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify({ profile: 'dailyflow-event-operator@1', versions }, null, 2)}\n`);
console.log(`Bundled DailyFlow DSH sidecar dependencies (${dependencyPaths.length} packages): ${outputRoot}`);

function collectClosure(rootNames) {
  const found = new Set();
  const queue = rootNames.map(name => ({ name, from: path.join(projectRoot, 'package.json') }));
  while (queue.length) {
    const item = queue.shift();
    let packageJson;
    try { packageJson = createRequire(item.from).resolve(`${item.name}/package.json`); } catch { continue; }
    const directory = path.dirname(packageJson);
    if (found.has(directory)) continue;
    found.add(directory);
    const json = JSON.parse(readFileSync(packageJson, 'utf8'));
    const names = new Set([
      ...Object.keys(json.dependencies ?? {}),
      ...Object.keys(json.peerDependencies ?? {}),
      ...Object.keys(json.optionalDependencies ?? {}),
    ]);
    for (const name of names) queue.push({ name, from: packageJson });
  }
  return [...found].filter(directory => directory.startsWith(sourceModules));
}
