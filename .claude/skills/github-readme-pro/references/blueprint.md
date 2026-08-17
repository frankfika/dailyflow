# Canonical README Blueprint

Use this section order for every README rewrite. Each section has a purpose and a target word count.

## 1. Hero / Centered Header (required)

```markdown
<div align="center">
<img src="./docs/assets/logo.svg" width="420" alt="Project Logo" />
<h1>Project Name</h1>
<p><b>One-line value proposition.</b></p>
<p>A 2-3 sentence description of the problem, the audience, and the main benefit.</p>
</div>
```

Purpose: tell visitors what this is in 3 seconds.

## 2. Badges (required)

First row: release, platform, stack, CI, license.
Second row: optional registry/package badges.

All badges must link to a real URL.

## 3. Table of Contents (optional for short README, required if > 600 words)

Keep it a single line of anchor links.

## 4. What is X? / Why? (required)

- The pain point.
- The workflow in 3 numbered steps.
- Who it is for.

## 5. Features (required)

Use `###` subsections with emoji prefixes. Each feature:
- 1-line summary.
- 3-5 bullets of capabilities.
- Screenshot placeholder if UI-heavy.

## 6. Screenshots / Demo (required for GUI apps)

- Use a 2x2 or 1x2 table for compactness.
- Add alt text.
- Caption each image.

## 7. Quick Start (required)

### Download
- Platform table with installer filenames.
- macOS quarantine fix if unsigned.

### From source
- Clone, install, run commands.
- Production build commands.

## 8. Development (required)

- Lint/test/build commands.
- Project structure tree.

## 9. Architecture (optional, but recommended for multi-layer apps)

Mermaid diagram or a short component list.

## 10. Docs / References (optional)

Bulleted list of key docs in `docs/`.

## 11. Contributing (required for open source)

Short paragraph + Conventional Commits reminder.

## 12. License (required)

Name + SPDX identifier if applicable.

## 13. Footer (optional)

Star / download / issue links.
