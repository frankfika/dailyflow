<div align="center">

<img src="./docs/assets/logo.svg" width="480" alt="DailyFlow Logo" />

# DailyFlow

> **Turn an endless backlog into three things for today**
>
> Commit to less. Actually finish more. Keep every task in local Markdown.

![Main Interface](./docs/assets/home.png)

![Version](https://img.shields.io/badge/Version-1.1.10-blue?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-green?style=flat-square)
![License](https://img.shields.io/badge/License-Apache--2.0-lightgrey?style=flat-square)
![Tech](https://img.shields.io/badge/Stack-React%20%2B%20Tauri%20%2B%20Solidity-purple?style=flat-square)

[Features](#-features) · [Screenshots](#-screenshots) · [Time Capsules](#-time-capsules) · [Quick Start](#-quick-start) · [Tech Stack](#-tech-stack) · [Contributing](#-contributing)

[简体中文](./README.md) | __English__

---

</div>

> [!IMPORTANT]
> This README describes the current implementation and its transitional Today’s Three experience. The source of truth for the next AI-native product is [`docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md`](./docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md). Future product, data-model, and implementation decisions should follow that specification.

## ✦ Next: Today’s Three

Most task managers help you **collect more**. DailyFlow now answers one narrower, more painful question:

> When the backlog never ends, what should I actually do today?

Open the app and AI first reads your backlog, priorities, deadlines, and stale work. Tell it what is different about today in one sentence; it proposes three commitments and explains the tradeoff. Re-plan in natural language or take over manually at any time.

1. **Capture** everything that is pulling at your attention
2. **Commit** to only three things worth moving today
3. **Finish** one next action at a time
4. **Close** the day without treating the remaining backlog as failure

---

## 📖 Introduction

DailyFlow is a **local-first daily focus tool for people with overloaded backlogs**. Markdown files are the single source of truth. AI, notes, and time capsules remain supporting tools; the core job is helping you choose and finish the three things that matter today.

### Why DailyFlow?

| Traditional | DailyFlow |
|-------------|-----------|
| Open the app to a wall of overdue work | Choose “Today’s Three”; everything else recedes |
| Never feel finished, no matter how much you do | Three completed commitments create a clear stopping point |
| Data locked in SaaS platforms | Local Markdown files, full ownership |
| Requires internet and Node.js installed | Offline-first, **bundled Node.js runtime** |
| Complex project tools manage everything | DailyFlow only helps you make today count |

---

## ✨ Features

### 🎯 Today’s Three (vNext)

- **AI daily planning**: describe your time, energy, and constraints in one sentence
- **Explainable tradeoffs**: AI says why it chose these three and what can wait
- **Natural-language re-planning**: tell AI when the day changes
- **Human control**: switch to manual selection at any time
- **One visual priority**: selected tasks leave the regular list instead of appearing twice
- **A visible finish line**: progress moves from 0/3 to 3/3
- **Local memory**: plans are stored separately by date, workspace, and Work/Life context

### 📋 Task Management

- **Auto Migration**: unfinished tasks auto-roll to the next day with source date tracking
- **Card-based UI**: tasks grouped by tags, with comments and linked notes
- **Work/Life Switch**: one-click context switching, tasks auto-filtered
- **Tag System**: `#tag`, `#deadline:date`, `#priority:level`, `#project:name`

### ⏳ Time Capsules (Experimental tool)

- **Three capsule types**: Commitment, Secret, Milestone
- **Multi-chain EVM**: Base Sepolia, Optimism Sepolia, Arbitrum Sepolia, Sepolia, local Hardhat
- **Wallet connect**: any injected wallet (MetaMask, Rabby, etc.)
- **On-chain hashing**: content hashed with keccak256 and committed on-chain; plaintext stays local
- **Time lock**: the smart contract guarantees content is invisible before `unlockAt`
- **Verifiable**: every capsule surfaces a tx hash and a block-explorer link
- **Delightful UI**: SVG illustrations, gradient backgrounds, live countdown

![Capsule Detail](./docs/assets/capsules-detail.png)

### 🤖 AI Assistant

- **AI Chat**: full chat interface with multi-session, context injection (today's tasks/notes/projects)
- **AI Tool Use**: AI can directly create tasks and save notes
- **Brain Dump**: pour in scattered thoughts, AI extracts and categorizes
- **AI Summary**: generate structured daily/weekly reports
- **Skill Marketplace**: slash commands and Agent Skills
- **Prompt Library**: manage and test AI prompt templates

![AI Chat](./docs/assets/ai-chat.png)

### 🔌 AI Model Support

One-click configuration for 15+ AI providers:

| Type | Providers |
|------|-----------|
| Aggregator | **B.AI** (29+ models, one key), OpenRouter |
| China | DeepSeek, Kimi, MiniMax, GLM, Doubao, Qwen, SiliconFlow |
| Global | Anthropic Claude, OpenAI, Google Gemini, Groq |
| Custom | Any OpenAI-compatible API |

### 📝 Notes

- **Multi-type**: regular notes, meeting notes, AI summaries
- **Read-only Preview**: click a card for read-only view, hit Edit to modify — no accidental edits
- **AI Assist**: polish, continue, extract todos, format meeting notes
- **Send to Chat**: bind a note as context in AI chat
- **@Mentions**: auto-parsed, filterable by person
- **Task Linking**: bidirectional linking between notes and tasks

![Notes](./docs/assets/notes.png)

### 📚 Multi-notebook / Workspaces

- Sidebar switcher for multiple Markdown folders
- Auto-discovers local note folders
- Each workspace remembers last visited date
- Workspaces, notes, and tasks share the same file tree

### 🔄 Sync & Backup

- **Git Sync**: one-click push to GitHub, status shown in sidebar
- **IPFS Backup**: decentralized backup via Pinata with permanent CID
- **In-app Updates**: auto-detect new versions, one-click install

---

## 📸 Screenshots

| Today (home) | Projects |
|:---:|:---:|
| ![Today](./docs/assets/home.png) | ![Projects](./docs/assets/projects.png) |

| AI Chat | Notes |
|:---:|:---:|
| ![AI Chat](./docs/assets/ai-chat.png) | ![Notes](./docs/assets/notes.png) |

| Time Capsules list | Capsule detail |
|:---:|:---:|
| ![Capsules](./docs/assets/capsules-list.png) | ![Capsule Detail](./docs/assets/capsules-detail.png) |

---

## ⏳ Time Capsules

### What is it?

**Time Capsules** is DailyFlow's third independent tab. You write **a commitment, a secret, or a life milestone**, lock its hash with a **real EVM smart contract**, and open it on a future date.

> It is neither a public diary (privacy-sensitive) nor a plain memo (no ceremony) — it is a **sealed envelope to your future self**, witnessed by a decentralized network.

### How does it work?

```
┌─────────────────┐         ┌──────────────────────┐         ┌─────────────────────┐
│  Local: write    │  keccak256  │  On-chain: store     │  unlockAt  │  Local: open       │
│  title / content │ ───────▶ │  contentHash + time   │ ───────▶ │  verify + reveal   │
│  type / unlockAt │   hash    │  lock in capsules[id] │  trigger  │  optional reveal  │
└─────────────────┘         └──────────────────────┘         └─────────────────────┘
```

- **Seal**: store full content locally, then call `seal(bytes32 contentHash, uint256 unlockAt, CapsuleType, bool isPublic)` on the contract
- **On-chain**: the contract records `id → creator → hash → unlockAt → status`
- **Wait**: the client marks a capsule as "openable" once `unlockAt <= now`
- **Open**: show full content locally; optionally call `reveal(id, status)` on-chain

### Capsule Types

| Type | Meaning | Best for |
|------|---------|---------|
| 🎯 Commitment | A promise | New Year resolutions, habits to break, OKRs |
| 🤫 Secret | A secret | A letter to your future self |
| 🏆 Milestone | A milestone | Graduation, first home, promotion, baby |

### Supported Chains

| Chain | Chain ID | Explorer | Status |
|-------|----------|----------|--------|
| Base Sepolia | 84532 | https://sepolia.basescan.org | Fill address after deploy |
| Optimism Sepolia | 11155420 | https://sepolia-optimism.etherscan.io | Fill address after deploy |
| Arbitrum Sepolia | 421614 | https://sepolia.arbiscan.io | Fill address after deploy |
| Sepolia | 11155111 | https://sepolia.etherscan.io | Fill address after deploy |
| Hardhat (local) | 31337 | - | ✅ Pre-configured |

### Deploy to a Testnet

```bash
cd contracts
cp .env.example .env  # fill PRIVATE_KEY and RPC URLs

# compile + test
npm install --legacy-peer-deps
npx hardhat compile
npx hardhat test

# deploy to a specific chain
npx hardhat run scripts/deploy.ts --network baseSepolia
npx hardhat run scripts/deploy.ts --network arbitrumSepolia

# Results are saved in contracts/deployments.json
# Plug the address for each chain into src/config/chains.ts -> CHAIN_CONTRACTS
```

### Technical References

- **Contract**: [contracts/contracts/DailyFlowCapsule.sol](./contracts/contracts/DailyFlowCapsule.sol)
- **ABI**: [src/contracts/abi.ts](./src/contracts/abi.ts)
- **Frontend hook**: [src/hooks/useCapsuleContract.ts](./src/hooks/useCapsuleContract.ts)
- **Wallet button**: [src/components/WalletConnectButton.tsx](./src/components/WalletConnectButton.tsx)
- **Chain config**: [src/config/chains.ts](./src/config/chains.ts)
- **Backend service**: [server/services/capsule.ts](./server/services/capsule.ts) (persists real tx data)

---

## 🚀 Quick Start

### 📦 Download (Recommended)

Grab the installer from [Releases](https://github.com/frankfika/dailyflow/releases/latest):

| Platform | File | Size |
|----------|------|------|
| macOS (Apple Silicon) | `DailyFlow_x.x.x_aarch64.dmg` | ~33 MB |
| macOS (Intel) | `DailyFlow_x.x.x_x64.dmg` | ~35 MB |
| Windows | `DailyFlow_x.x.x_x64-setup.exe` | ~30 MB |
| Linux | `DailyFlow_x.x.x_amd64.AppImage` | ~34 MB |

> **macOS users**: If you see "damaged" / "cannot be opened":
> ```bash
> sudo xattr -rd com.apple.quarantine /Applications/DailyFlow.app
> ```
>
> **Truly self-contained**: the dmg bundles the Node.js runtime — **no system Node required**, just download and run.

### Run from Source

Requirements: **Node.js ≥ 20** (only needed for development, not at runtime)

```bash
git clone https://github.com/frankfika/dailyflow.git
cd dailyflow
npm install

# Dev mode (frontend + backend)
npm run dev:all

# Or run as a desktop app
npm run tauri dev

# Full build (including Tauri desktop app)
npm run build
npm run build:server
npm run tauri build
```

### Contracts (optional — only if you want to deploy your own)

```bash
cd contracts
npm install --legacy-peer-deps
npx hardhat compile
npx hardhat test  # all green
```

### First Use

1. Launch the app and set your **workspace directory** (where Markdown files will be stored)
2. App auto-creates today's journal file
3. Write today's tasks on the Today page and tag projects with `#project:name`
4. Switch to the **Notes** tab to create meeting notes or capture ideas
5. Open **⏳ Time Capsules**, connect your wallet, and seal a promise for the future
6. Open **AI Chat** and attach today's tasks or any note as context for your questions

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Tauri Desktop Shell                                  │
│           (Bundled Node.js runtime, zero external deps)              │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐         ┌─────────────────────────────┐         │
│  │   React UI     │◀───────▶│   Express Backend (3003)     │         │
│  │ (Vite/TS/TSX)  │  HTTP   │   (Bundled Node + Server)    │         │
│  └───────┬────────┘         └────────────┬────────────────┘         │
│          │                               │                          │
│          │ wagmi / viem                  │                           │
│          ▼                               │                          │
│  ┌────────────────┐                      │                          │
│  │  Time Capsules │  keccak256   ┌──────▼──────────────┐           │
│  │  (Tab 3)       │ ─────────▶   │  Markdown + Capsule │           │
│  │                │              │  Storage            │           │
│  └────────────────┘              └──────┬──────────────┘           │
│                                         │                          │
│              ┌──────────────────────────┼───────────────────────┐ │
│              ▼                          ▼                       ▼ │
│      ┌──────────────┐            ┌────────────┐          ┌────────┐ │
│      │ Git (GitHub) │            │ IPFS/Pinata│          │  EVM   │ │
│      │              │            │            │          │ Chains │ │
│      └──────────────┘            └────────────┘          └────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Changes in v1.0.6

- **Real multi-chain EVM integration**: capsule `seal` / `reveal` go to real contracts across 5 chains
- **Wallet abstraction layer**: wagmi + viem provide a unified API for connect, sign, switch chain
- **Privacy-first design**: content is keccak256-hashed on-chain; plaintext stays 100% local
- **Backend persistence**: local service records `txHash` / `chainId` / `contractAddress` / `onChainId` for list display
- **Decoupled contracts**: Hardhat project lives under [contracts/](./contracts/), independent of the front-end

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript + Tailwind CSS 4 + Motion (Framer Motion) |
| Build | Vite 6 + esbuild |
| Backend | Express.js (TypeScript) |
| Desktop | Tauri 2 (Rust) |
| Runtime | **Bundled Node.js 20+** (auto-downloaded with permission handling) |
| Data | Markdown files + YAML frontmatter (single source of truth) |
| AI | 15+ providers (B.AI / Claude / GPT / Gemini / DeepSeek / Kimi / GLM / Qwen etc.) |
| Blockchain | wagmi 3 + viem 2 + Solidity 0.8.24 + Hardhat + @nomicfoundation/hardhat-toolbox-viem |
| Multi-chain | Base / Optimism / Arbitrum / Sepolia / Hardhat |
| Sync | Git + GitHub API |
| Backup | IPFS + Pinata |
| Tests | Vitest + Testing Library + Hardhat tests |

---

## 🤝 Contributing

Contributions are welcome — code, bug reports, and feature ideas.

### Local Development

```bash
git clone https://github.com/frankfika/dailyflow.git
cd dailyflow
npm install
npm run dev:all

# contracts
cd contracts
npm install --legacy-peer-deps
npx hardhat test
```

### Code Standards

- TypeScript strict mode, all PRs must pass `npm run lint`
- Test coverage: new features require tests; run `npm test` to confirm green
- Component naming: PascalCase; utility functions: camelCase; types: PascalCase
- Commit messages: follow Conventional Commits (`feat:` / `fix:` / `chore:` / `docs:` / `test:`)

### Pull Request Flow

1. Fork the repo and branch from `main`: `git checkout -b feat/your-feature`
2. Commit your changes: `git commit -m "feat: add your feature"`
3. Push: `git push origin feat/your-feature`
4. Open a Pull Request on GitHub describing the change and tests

### Bug Reports

Use [GitHub Issues](https://github.com/frankfika/dailyflow/issues) and include:

- Reproduction steps
- Expected vs actual behavior
- System info (macOS / Windows / Linux version)
- App version (Settings → About)

---

## 📜 Changelog

### v1.0.6 (2026-07-13)

**⏳ Time Capsules live: real multi-chain EVM integration**

#### ✨ New

- ⏳ **Time Capsules tab**: a third independent tab with Commitment / Secret / Milestone
- ⛓ **Real EVM sealing**: wagmi + viem call `seal(bytes32, uint256, CapsuleType, bool)` on a smart contract; content is keccak256-hashed on-chain
- 🦊 **Wallet connect**: any injected wallet (MetaMask, Rabby, …) with one-click chain switching across 5 chains
- 🌐 **Multi-chain**: Base Sepolia / Optimism Sepolia / Arbitrum Sepolia / Sepolia / local Hardhat
- 🔐 **Privacy-first**: 100% plaintext stays local; only the hash lives on-chain
- 🎨 **Delightful UI**: SVG capsule illustrations, gradient backgrounds, live countdown, block-explorer links

#### 📦 Contracts

- 🏗 Brand-new [contracts/](./contracts) Hardhat project (independent `package.json`)
- 📜 [DailyFlowCapsule.sol](./contracts/contracts/DailyFlowCapsule.sol): `seal` / `reveal` / `getCapsule` / `getCreatorCapsules`, with `CapsuleSealed` / `CapsuleRevealed` events
- 🧪 8 Hardhat tests, all passing
- 🚀 [deploy.ts](./contracts/scripts/deploy.ts): auto-saves addresses to `deployments.json`
- 🔍 Etherscan API key config (for verify)

#### 🔧 Backend

- [server/services/capsule.ts](./server/services/capsule.ts): persists real `txHash` / `chainId` / `contractAddress` / `onChainId` / `contentHash`
- [server/routes/capsule.ts](./server/routes/capsule.ts): new `POST /capsules/:id/seal/evm` accepts the front-end's on-chain proof

### v1.0.5 (2026-07)

chore: version bump and dependency updates

### v1.0.1 (2026-06-19)

**🧹 Tightened scope and fixed AI Chat note linking**

#### ✨ Improvements

- 🗑️ **Removed Thinking Workspaces**: rolled back the over-designed workspace feature to keep the app focused on tasks + notes + AI chat
- 🔗 **AI Chat can attach any note**: the context picker now searches all notes in the current context, not just today's notes
- 🧭 **Simplified sidebar**: removed the Workspaces nav item, leaving Today / Notes / AI Chat

#### 🧪 Quality

- 145 tests passing, TypeScript strict mode, 0 errors

### v1.0.0 (2026-06)

**🎉 Major milestone**

- 🧠 Thinking Workspaces (rolled back in v1.0.1)
- 🤖 AI Brief / Journey / Mind Map
- ✅ AI Next Tasks breakdown
- 📅 Timeline tracking
- 🔒 Crypto-random IDs (prevents ID takeover)
- 📦 Bundled Node.js runtime (zero external deps)

### Earlier Versions

See the [full changelog](https://github.com/frankfika/dailyflow/releases).

---

## 📄 License

[Apache License 2.0](./LICENSE)

---

## 🙏 Acknowledgments

Thanks to all contributors and users for their feedback. DailyFlow started as a small wish — "I don't want to manually organize my todos every day" — and has grown into a complete system that includes tasks, notes, AI chat, and **on-chain time capsules**.

<div align="center">

If this project helps you, a ⭐ would be appreciated!

[⭐ Star on GitHub](https://github.com/frankfika/dailyflow) · [📥 Download latest](https://github.com/frankfika/dailyflow/releases/latest) · [🐛 Report a Bug](https://github.com/frankfika/dailyflow/issues)

</div>
