# DailyFlow 上下文资产 Roadshow Deck

A 15-slide, 1600×900 editorial pitch deck for the DailyFlow project,
built around the **context-asset** narrative: models depreciate,
context appreciates. Ends with a two-slide hardware extension.

> Tuned for roadshow pressure: a thesis about the AI era, not a feature
> list. Low density by design — every slide lands one claim. Narrative
> source: `docs/ROADSHOW_NARRATIVE.md`.

## Stage 0 — Reference contract

| Slot | Choice |
|---|---|
| Output | Self-contained HTML/CSS/JS deck project (this folder) |
| Canvas | 1600×900, 16:9, `--scale` computed from viewport |
| Audience | AI roadshow judges / investors |
| Language | Default `zh-CN` with `en-US` real translation (every claim is translated) |
| Visual direction | Editorial: white field, hairline grid, serif display headline; mint = agent, violet = memory/evidence, amber = human/future |
| Slide count | 15 |
| Density rule | One claim per slide; bodies are one line, not paragraphs |

## Stage 0 — Story arc

| # | Family | Claim it has to land |
|---|---|---|
| 01 | cover | "别人卖 AI 的工时，我们帮你积累不贬值的上下文资产。" |
| 02 | thesis-shift | 15+ models commoditised · cloud AI remembers 0 bytes · 92% of systems abandoned → context appreciates. |
| 03 | pain-grid | Four open secrets: discipline assumption · entropy decay · rented context · no evidence. |
| 04 | editorial-insight | The missing piece: outsourcing *system maintenance* itself to an agent. |
| 05 | system-overview | L1 local Markdown data · L2 rules-first agent · L3 proposal gate. |
| 06 | case-capsule | The memory moment: "what did I promise the investor" → evidence → overdue nudge → proposal. |
| 07 | ai-matrix | Six agent capabilities — capture · extract · plan · memory · propose · review. |
| 08 | evidence | Real screenshots: Today, AI Chat, Notes, Projects. |
| 09 | architecture | Real `planningService.ts`: rules first, model second. |
| 10 | demo | 3-min, 5-scene live demo — the cloud products can't run it. |
| 11 | moat | Compounding context · trust architecture · book × product · solo velocity. |
| 12 | thesis-shift | WHY HARDWARE: software captures life at the keyboard; hardware captures everything else. AI Pin lesson: do one thing. |
| 13 | system-overview | HARDWARE LOGIC: capture layer (device) → asset layer (Markdown, shipped) → intelligence layer (Agent, shipped). Privacy drops from protocol to physical. |
| 14 | ask | Distribution (1K builders) · ecosystem (skills + hardware co-build) · narrative (whitepaper). 90 days. |
| 15 | closing | "模型会贬值，上下文会升值。" — let the memory be yours. |

## Run the preview

```bash
npm run dev            # inside deck/ — honours --port / --host / $PORT
# or from the repo root:
node deck/scripts/serve-deck.cjs
```

Do not use `file://` as the verification surface.

## Verify

```bash
node scripts/verify-deck.cjs
```

Checks slide count, duplicate IDs, missing assets, and obvious overflow.

## Keyboard shortcuts

- `→` / `Space` / `PageDown` — next slide
- `←` / `PageUp` — previous slide
- `Home` / `End` — first / last slide
- `o` — overview mode
- `f` — fullscreen
- `p` — print to PDF
- `1` / `2` — switch language (zh / en)

## What is grounded vs directional

Grounded in source code:

- `v1.8.0` current release (2026-08-17), per `package.json` / `CHANGELOG.md`
- 99 test files across `src/`, `server/`, `e2e/`
- 15+ AI providers behind one OpenAI-compatible interface (Model Center)
- Rules-first planner — `server/services/v2/planningService.ts` (spec §15.3)
- Evidence-backed memory — `server/services/v2/memoryService.ts` (snippet + source)
- Proposal-first writes + audit — `server/services/v2/proposalService.ts`
- Local Whisper transcription — `server/services/v2/localTranscriptionService.ts`
- Commitment tracking incl. stale detection — `server/services/v2/commitmentService.ts`

Directional (framed as anchors / theses, not audited figures):

- "92% abandoned in 60 days" — Strava-style longitudinal anchor.
- Hardware slides (12–13) — forward-looking extension; the capture device is
  in planning, the software layers it feeds are shipped.
- "AI Pin / Rabbit vs Plaud" — market-pattern anchor, not a cited study.

## Editorial choices

- The deck deliberately dropped the Web3 time-capsule narrative; the story is
  now pure context-asset. (The capsule feature still exists in the product.)
- Slide 06 is the spine: ask → evidence → act, ending on the
  "cloud products can't run this demo" punchline.
- Slide 09 carries the **real** planner code shape, not a stylised diagram.
- Hardware is the closing extension, not the opener: the software story must
  stand on its own first.
- The ask ends with a black press-bar ("three things, 90 days") so judges can
  quote it back when the scoring sheet comes out.
