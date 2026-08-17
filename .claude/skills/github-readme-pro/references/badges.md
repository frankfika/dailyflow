# Badge Patterns

Always use shields.io or GitHub-native badges. Prefer `flat-square` style for a modern look.

## Required badges (top row)

```markdown
![Version](https://img.shields.io/github/v/release/{owner}/{repo}?style=flat-square&label=version)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-green?style=flat-square)
![Stack](https://img.shields.io/badge/stack-React%20%2B%20Tauri%20%2B%20Express-purple?style=flat-square)
![CI](https://img.shields.io/github/actions/workflow/status/{owner}/{repo}/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI)
![License](https://img.shields.io/badge/license-Apache--2.0-lightgrey?style=flat-square)
```

## Optional second row

```markdown
![Release Date](https://img.shields.io/github/release-date/{owner}/{repo}?style=flat-square)
![Downloads](https://img.shields.io/github/downloads/{owner}/{repo}/total?style=flat-square)
![Repo Size](https://img.shields.io/github/repo-size/{owner}/{repo}?style=flat-square)
```

## Version sentence

Always pair the badge with a sentence like:

```markdown
**Current stable release: v1.9.0** · [Download and install](https://github.com/{owner}/{repo}/releases/latest) <!-- x-release-please-version -->
```

The `x-release-please-version` comment lets release-please update the version string automatically.

## Platform badge update rules

- If a new architecture is added (e.g., `macOS Intel`), add it to the badge.
- If a platform is dropped, remove it and explain in the body.
- Do not claim a platform unless CI actually builds for it.

## Fallbacks

- If CI workflow name changed, update the badge URL.
- If the license changed, update both badge and `LICENSE` file reference.
