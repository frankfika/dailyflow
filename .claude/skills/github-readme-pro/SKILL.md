---
name: github-readme-pro
description: Automatically audit, optimize, and synchronize GitHub README.md files with release notes, screenshots, badges, and bilingual support.
metadata:
  type: project
---

# GitHub README Pro

A comprehensive Claude Code skill that audits, restructures, and polishes your GitHub README.md. It keeps the English README authoritative, mirrors the key structure to a Chinese README (or vice versa), updates badges and version strings, and guides you through screenshot refresh.

## When to use

Invoke this skill when:
- A new release is about to be published or has just been published.
- You added/removed a major feature and the README no longer reflects reality.
- The README grew messy over time and needs a structural cleanup.
- You need a Chinese/English bilingual README pair.
- Badges, version numbers, screenshots, or installation instructions are stale.

## Outputs

- `README.md` — updated primary README (English by default).
- `README_ZH.md` or `README_EN.md` — updated secondary README (whichever is missing/stale).
- A checklist of manual follow-ups (badges that need new tokens, screenshots to re-capture, etc.).

## How to invoke

Say one of the following:

```
/ github-readme-pro
优化 README
更新 README 到最新版本
同步中英文 README
```

## Execution flow

### Step 1 — Discovery
Read the current repository state:
- `package.json` / `Cargo.toml` / `pyproject.toml` for version, name, description.
- `README.md` and any secondary README (`README_EN.md`, `README_ZH.md`, `README_CN.md`).
- `CHANGELOG.md` for the latest release notes.
- `src-tauri/Cargo.toml`, `.github/workflows/`, `docs/assets/` if they exist.
- Existing screenshots in repo root or `docs/assets/`.

### Step 2 — Audit
Check the README against this rubric:

| Check | Weight | Action if failing |
|---|---|---|
| Hero / logo present | required | Add centered logo or project title banner |
| One-line value proposition | required | Rewrite the subtitle/tagline |
| Badges: version, platform, stack, CI, license | required | Add or fix shields.io badges |
| Badges reflect current version | required | Update version badge and release link |
| Quick-start install commands | required | Add copy-paste install blocks |
| Feature list with sub-bullets | required | Expand or restructure |
| Screenshots / GIFs | strong | Flag for refresh or add placeholders |
| Architecture diagram or mermaid | strong | Add if complex architecture |
| Development commands | medium | Add `npm run lint/test/build` block |
| Project structure block | medium | Add tree overview |
| Contributing + License | medium | Add if missing |
| Secondary README synced | strong | Create/update translation |
| No broken relative links | required | Fix or remove |
| No stale TODOs or placeholder text | required | Remove or replace |

### Step 3 — Restructure
Apply the canonical README blueprint (see `references/blueprint.md`). Preserve any project-specific sections (AI providers, Feishu sync, etc.) but move them into the standard structure.

### Step 4 — Content update
- Pull the latest `feat:` / `fix:` items from `CHANGELOG.md` into the feature list.
- Update the **Current version** sentence and badge link.
- Refresh installation package filenames if the release asset pattern changed.
- Update platform list if new architectures were added.

### Step 5 — Screenshot review
- List every image referenced in the README.
- Check whether the file still exists and is not older than the last minor release.
- If stale or missing, run `node scripts/capture-screenshots.mjs` when available, or ask the user to capture new ones.

### Step 6 — Secondary README
Mirror the primary README structure into the secondary language. Do not translate code blocks, commands, or file paths. Keep badge URLs identical.

### Step 7 — Final checklist
Return a concise markdown checklist of anything that still needs human review.

## Rules

1. **English is primary, Chinese is secondary** unless the repo is clearly Chinese-first.
2. **Never delete project-specific documentation**; reorganize it.
3. **Never invent fake screenshots**; use placeholders with clear capture instructions.
4. **Keep badges live**; prefer shields.io and GitHub-native URLs over static images.
5. **Version numbers must match** the latest release-please manifest or package file.
6. **One `npm run build` / `npm test` command block is enough**; don't duplicate platform-specific instructions.

## Example output

See `examples/README.before.md` and `examples/README.after.md` for a full transformation example.

## Reference materials

- `references/blueprint.md` — canonical README section order and rationale.
- `references/badges.md` — shields.io badge patterns and fallback URLs.
- `references/screenshot-guide.md` — how to refresh screenshots and GIFs.
- `references/bilingual-style.md` — rules for keeping Chinese/English READMEs in sync.
