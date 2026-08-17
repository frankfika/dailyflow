# Screenshot and Demo Guide

## When to refresh screenshots

Refresh screenshots when:
- A major UI section changed (sidebar, settings, today view, etc.).
- A new feature has a dedicated surface (e.g., Events, Mind Map, AI Model Center).
- The current screenshots are older than the last minor release.
- Any screenshot file is referenced but missing.

## How to capture

### Automated

If the project has `scripts/capture-screenshots.mjs`:

```bash
npm run build
node scripts/capture-screenshots.mjs
```

### Manual

1. Run the app in the target environment (`npm run dev:all` or `npm run tauri dev`).
2. Use the same workspace seed data each time for consistency.
3. Capture at a fixed viewport (e.g., 1280x800).
4. Save to `docs/assets/` with descriptive names:
   - `home.png` — Today view
   - `ai-chat.png` — AI chat
   - `notes.png` — Notes editor
   - `events.png` — Events / mind map
   - `settings.png` — Settings

## Image optimization

- Use PNG for UI screenshots.
- Keep each image under 300 KB when possible.
- Use a consistent naming convention: `{feature}-{state}.png`.

## Demo GIF / video

For complex workflows, prefer a short GIF or MP4 over multiple screenshots. Place it right after the hero section.

## Placeholder policy

If a screenshot cannot be generated automatically, insert a placeholder block:

```markdown
![Events mind map outline + canvas](./docs/assets/events.png)
```

Then add a follow-up task: "Capture `docs/assets/events.png` at 1280x800 using the seeded workspace."
