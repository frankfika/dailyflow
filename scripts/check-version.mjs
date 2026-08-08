import { readFileSync } from "node:fs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readTomlSectionVersion(path, section) {
  const content = readFileSync(path, "utf8");
  const marker = `[${section}]`;
  const sectionStart = content.indexOf(marker);
  if (sectionStart === -1) return undefined;

  const remaining = content.slice(sectionStart + marker.length);
  const nextSection = remaining.search(/^\[/m);
  const block =
    nextSection === -1 ? remaining : remaining.slice(0, nextSection);
  return block?.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];
}

function readCargoLockVersion(packageName) {
  const content = readFileSync("src-tauri/Cargo.lock", "utf8");
  const packageBlocks = content.split(/^\[\[package\]\]\s*$/m).slice(1);

  for (const block of packageBlocks) {
    const name = block.match(/^name\s*=\s*"([^"]+)"\s*$/m)?.[1];
    if (name === packageName) {
      return block.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];
    }
  }

  return undefined;
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const releaseManifest = readJson(".release-please-manifest.json");
const readme = readFileSync("README.md", "utf8");
const expected = packageJson.version;

const versions = new Map([
  ["package.json", expected],
  ["package-lock.json", packageLock.version],
  ["package-lock.json root package", packageLock.packages?.[""]?.version],
  ["src-tauri/tauri.conf.json", tauriConfig.version],
  [".release-please-manifest.json", releaseManifest["."]],
  [
    "README.md stable release",
    readme.match(/当前稳定版：v([^*\s]+)/)?.[1],
  ],
  [
    "src-tauri/Cargo.toml",
    readTomlSectionVersion("src-tauri/Cargo.toml", "package"),
  ],
  ["src-tauri/Cargo.lock", readCargoLockVersion("dailyflow")],
]);

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expected)) {
  throw new Error(`Invalid semantic version in package.json: ${expected}`);
}

if (tauriConfig.bundle?.createUpdaterArtifacts !== true) {
  throw new Error(
    "Tauri updater artifacts are disabled; set bundle.createUpdaterArtifacts to true.",
  );
}

const mismatches = [...versions].filter(([, version]) => version !== expected);
if (mismatches.length > 0) {
  const details = mismatches
    .map(
      ([file, version]) =>
        `${file}: ${version ?? "missing"} (expected ${expected})`,
    )
    .join("\n");
  throw new Error(`Version files are inconsistent:\n${details}`);
}

console.log(`All release files use version ${expected}.`);
