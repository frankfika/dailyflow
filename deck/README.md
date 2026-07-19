# DailyFlow AI + Web3 Demo Deck

A 20-slide, 1600×900 editorial pitch deck for the DailyFlow project, built
with the project's `editorial-deck-builder` skill for an AI × Web3 demo
competition.

> Tuned for judge pressure: 4-minute arc, every claim underwritten by real
> code, real screenshots, real chain IDs. Press `o` to jump between scenes.

## Stage 0 — Reference contract

| Slot | Choice |
|---|---|
| Output | Self-contained HTML/CSS/JS deck project (this folder) |
| Canvas | 1600×900, 16:9, `--scale` computed from viewport |
| Audience | AI × Web3 demo competition judges |
| Language | Default `zh-CN` with `en-US` real translation (every claim is translated) |
| Reference visual direction | Editorial Productivity OS: white field, hairline grid, serif display headline, command pill, restrained mint (AI) + violet (on-chain) accents, amber for human/future moments |
| Brand-neutrality | No reference brand is copied; DailyFlow's own UI screenshots are reused as evidence under `assets/media/` |
| Slide count | 20 (cover · shift · vision · pain · insight · solution · case · multi-chain · ai · evidence · architecture · live demo · milestones · market · moat · narrative · roadmap · impact · ask · closing) |
| Slide families | `cover`, `thesis-shift`, `vision`, `pain-grid`, `editorial-insight`, `system-overview`, `case-capsule`, `chain-matrix`, `ai-matrix`, `evidence`, `architecture`, `demo`, `timeline`, `market`, `moat`, `narrative`, `roadmap`, `impact`, `ask`, `closing` |

## Stage 0 — Story arc

| # | Family | Claim it has to land |
|---|---|---|
| 01 | cover | "DailyFlow — a personal workspace where promises are witnessed by the future." |
| 02 | thesis-shift | Personal AI and personal Web3 matured in the same season (2B · 100M · 92%). |
| 03 | vision | Stitch AI's brain + Web3's notary + local Markdown into a personal chain. |
| 04 | pain-grid | "Many write the promise. Very few keep it." — four failure modes. |
| 05 | editorial-insight | The missing piece is a *witness* the future can open — not more AI. |
| 06 | system-overview | DailyFlow = L1 Local-First · L2 AI · L3 EVM. Three layers, three test stacks. |
| 07 | case-capsule | One real journey: seal → keccak256 → on-chain → witness → reveal. |
| 08 | chain-matrix | Five EVM testnets + Hardhat local. Plaintext 100% local. |
| 09 | ai-matrix | Six AI capabilities, 15+ model providers, one context. |
| 10 | evidence | Real screenshots from Today, Notes/AI, Time Capsule, Detail. |
| 11 | architecture | Real `DailyFlowCapsule.sol` with `seal()` / `reveal()` / 8/8 green. |
| 12 | demo | 3-min, 5-scene live demo script — wallet → keccak256 → explorer → reveal. |
| 13 | timeline | P0 → P5 in 14 weeks; v1.0.0 → v1.0.6 from one builder. |
| 14 | market | AI × personal-Web3 intersection forming — DailyFlow sits on it. |
| 15 | moat | Local-first · AI × chain · personal-chain shape · solo velocity. |
| 16 | narrative | DAO Pledge · Quit-Protocol · Life-Milestones · 70-year life ledger. |
| 17 | roadmap | v1.1 Chrome ext + GH Action → v2.0 mobile + E2EE → v3.0 protocol. |
| 18 | impact | 10K × 100 = 1M on-chain witnesses / year — the next protocol at human scale. |
| 19 | ask | If this wins: distribution · mainnet · narrative. Three things, 90 days. |
| 20 | closing | Let the next million promises be witnessed — *with judges*. |

## Run the preview

```bash
node scripts/serve-deck.cjs
# open http://localhost:4173
```

Do not use `file://` as the verification surface — see SKILL.md "Stage 1".

## Verify

```bash
node scripts/verify-deck.cjs
```

Checks slide count, duplicate IDs, missing assets, and obvious overflow.

## Project layout

```
deck/
├── index.html
├── assets/
│   ├── deck-base.css               # tokens + canvas + typography + primitives
│   ├── deck-layout.css             # stage + chrome + print rules
│   ├── deck-slide-cover.css
│   ├── deck-slide-thesis.css
│   ├── deck-slide-vision.css       # NEW — halo personal-chain diagram
│   ├── deck-slide-grid.css         # pain-grid
│   ├── deck-slide-editorial.css    # editorial-insight
│   ├── deck-slide-system.css       # system-overview (3 layers)
│   ├── deck-slide-case.css         # case-capsule
│   ├── deck-slide-chain.css        # chain-matrix
│   ├── deck-slide-matrix.css       # ai-matrix
│   ├── deck-slide-evidence.css     # real screenshots
│   ├── deck-slide-architecture.css # NEW — real Solidity code panel
│   ├── deck-slide-demo.css         # NEW — 5-scene live demo script
│   ├── deck-slide-timeline.css
│   ├── deck-slide-market.css
│   ├── deck-slide-moat.css         # NEW — 4-quadrant defensibility
│   ├── deck-slide-narrative.css    # 4 use-cases
│   ├── deck-slide-roadmap.css
│   ├── deck-slide-impact.css       # NEW — 1M hero + assumption stack
│   ├── deck-slide-ask.css          # NEW — 3 cards + black press-bar
│   ├── deck-slide-closing.css
│   ├── deck-app.js                 # nav, overview, fullscreen, i18n, print
│   └── media/                      # DailyFlow product screenshots + brand mark
├── scripts/
│   ├── serve-deck.cjs
│   └── verify-deck.cjs
└── README.md
```

## Keyboard shortcuts

- `→` / `Space` / `PageDown` — next slide
- `←` / `PageUp` — previous slide
- `Home` / `End` — first / last slide
- `o` — overview mode
- `f` — fullscreen
- `p` — print to PDF
- `1` / `2` — switch language (zh / en)

## What is grounded vs invented

Grounded in source code and verifiable on screen:

- `v1.0.6` and `1.0.0` release codes
- `DailyFlowCapsule.sol` — Solidity 0.8.24, `enum CapsuleType { Commitment, Secret, Milestone }`
- 5 EVM chains: Base Sepolia, OP Sepolia, Arbitrum Sepolia, Ethereum Sepolia, Hardhat
- 15+ AI providers listed in `assets/media/`-adjacent App manifest
- 145 product tests / 8 Hardhat tests, both stated as "green" — verifiable via `pnpm test`
- AI × Web3 stack — Tauri 2 desktop + wagmi 3 + viem 2 — verifiable in `package.json`

Directional (clearly framed as *directional*, not baked):

- Market sizing (2B / 100M / 92%) — directional; cited as anchors in the
  caption, not as audited figures.
- "1M on-chain witnesses / year" — a 10K × 100 thought experiment on
  the impact slide, labeled as `ASSUMPTIONS · ANCHORED`.
- Web3 narrative extensions (DAO Pledge / Quit-Protocol / Life NFT) —
  explicitly marked as a *futures section*, not committed roadmap.

## Editorial choices

- Single accent system: `#14B58A` mint = AI actions, `#7C5CFF` violet = Web3 /
  on-chain, `#F4A93B` amber = human / future, `#0B0B0F` ink on `#FAFAF7` paper.
- Cover uses an asymmetric text-and-capsule-diagram layout; no giant dark hero.
- Closing uses a controlled full-bleed dark field — the only slide that
  does — to bookend the deck.
- Vision slide carries a halo + 4 satellite nodes; intentional
  reference to a venn-orbit, kept minimal.
- Architecture carries the **real** `DailyFlowCapsule.sol` source, not a
  stylised version.
- Impact slide opens with `1+M promises / year` — the largest number
  in the deck — before walking back to assumptions; deliberate
  one-number climax.
- Ask slide ends with a black `press-bar` summarising the ask into a
  single sentence ("three things, 90 days") so the judges can quote
  it back when the scoring sheet comes out.
- No fabricated customer logos, no fake charts with arbitrary numbers,
  no unverifiable timestamps.
