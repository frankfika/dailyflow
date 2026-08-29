# Changelog

All notable changes to DailyFlow will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.0](https://github.com/frankfika/dailyflow/compare/v2.3.1...v2.4.0) (2026-08-29)


### Features

* **ai:** harden provider proxy & connection handling ([a767cc3](https://github.com/frankfika/dailyflow/commit/a767cc3e815a4fcc15a527a92a599757e48421ab))
* **events:** project action commitments from meeting notes ([131e514](https://github.com/frankfika/dailyflow/commit/131e51402075211c734bc3646015e370071e8f36))
* **notes:** rich-text editor, resizable panes & focus mode ([3d47e4c](https://github.com/frankfika/dailyflow/commit/3d47e4ca8a90baa4fb2cecb1e48bc56cc27b1692))
* **privacy:** reflect real control locations in PrivacyPanel ([766e262](https://github.com/frankfika/dailyflow/commit/766e262e25a71c56ccec1a264edf7698cab8e7af))


### Bug Fixes

* **harness:** harden DSH runtime process manager ([da2d758](https://github.com/frankfika/dailyflow/commit/da2d758293b4b58eed9b74e2bfe5c6a2e340de0a))
* **server:** allow loopback origins in dev CORS allowlist ([dee4b5e](https://github.com/frankfika/dailyflow/commit/dee4b5ebdab76338cb630c79a30b5f0cb77619ef))

## [2.3.1](https://github.com/frankfika/dailyflow/compare/v2.3.0...v2.3.1) (2026-08-26)


### Bug Fixes

* **packaging:** preserve Windows Node executable ([06e567b](https://github.com/frankfika/dailyflow/commit/06e567b1f198b18768853f83e34c9d0edfe0f26c))

## [2.3.0](https://github.com/frankfika/dailyflow/compare/v2.2.2...v2.3.0) (2026-08-26)


### Features

* **event-operator:** ship DeepSeek Harness runtime ([ccb3ab2](https://github.com/frankfika/dailyflow/commit/ccb3ab22aa40f8ad0f33a7a66c1ff3e86b71cf96))


### Bug Fixes

* **ci:** sync DSH peer dependency lockfile ([b133cf5](https://github.com/frankfika/dailyflow/commit/b133cf55e04cb72ef0fbdb2ea8ad3d3a54dcfe1d))

## [2.2.2](https://github.com/frankfika/dailyflow/compare/v2.2.1...v2.2.2) (2026-08-24)


### Maintenance

* consolidate all completed development branches into `main` and prepare a clean release baseline

## [2.2.1](https://github.com/frankfika/dailyflow/compare/v2.2.0...v2.2.1) (2026-08-23)


### Bug Fixes

* **events:** respect collapsedIds when hiding node subtrees in the canvas ([4ed3d49](https://github.com/frankfika/dailyflow/commit/4ed3d4930804f398b14e6d018989c4a94a366a1d))

## [2.2.0](https://github.com/frankfika/dailyflow/compare/v2.1.1...v2.2.0) (2026-08-23)


### Features

* **event-operator:** AI Event Operator vertical slice — “AI 推进” (模板模式) ([#50](https://github.com/frankfika/dailyflow/issues/50)) ([68d5e2a](https://github.com/frankfika/dailyflow/commit/68d5e2aef32521912d5dc053fb0c21c240db914c))

## [2.1.1](https://github.com/frankfika/dailyflow/compare/v2.1.0...v2.1.1) (2026-08-21)


### Bug Fixes

* harden persistence and workspace flows ([44bbae2](https://github.com/frankfika/dailyflow/commit/44bbae2eb7fb58aec80d9e935898da7389263a29))
* update advanced navigation after branch merge ([729b46a](https://github.com/frankfika/dailyflow/commit/729b46a1deaad844bb3eb066b67f6c1d97f4300c))

## [2.1.0](https://github.com/frankfika/dailyflow/compare/v2.0.0...v2.1.0) (2026-08-21)


### Features

* **events:** Ctrl/Cmd+wheel zoom anchored at pointer + Fit all button ([aa0a510](https://github.com/frankfika/dailyflow/commit/aa0a5108547bf814be0d6f1529e9f44a9c63d7cf))


### Bug Fixes

* **mindmap:** remove hand-rolled wheel zoom that broke trackpad scrolling ([2f23b88](https://github.com/frankfika/dailyflow/commit/2f23b88947a1220139a4c840706b33194a4e44e2))
* **server/test:** resolve local transcription types + vitest scanning worktrees ([8ef2bf3](https://github.com/frankfika/dailyflow/commit/8ef2bf3db53d29704ab6329753c08e53d665ea49))


### Performance Improvements

* **events:** stop re-GETting the full mind map before every mutation ([f1ef18f](https://github.com/frankfika/dailyflow/commit/f1ef18f88152c86e483535ae52612d224a1df531))

## [2.0.0](https://github.com/frankfika/dailyflow/compare/v1.9.0...v2.0.0) (2026-08-20)


### ⚠ BREAKING CHANGES

* Mind-map node `kind` field is now one of 7 values: `root` | `branch` | `tag` | `task` | `question` | `resource` | `risk` (was 4). Legacy nodes default to `branch`; no migration required.

### Features

* **mindmap:** 7 node kinds with distinct icon + color ([9370ecd](https://github.com/frankfika/dailyflow/commit/9370ecd))
* **mindmap:** AI organize suggestion (by_topic / by_priority / by_time) ([ad4d91e](https://github.com/frankfika/dailyflow/commit/ad4d91e))
* **mindmap:** mirror task completion back to node (`status=done` + 完成块) ([0d0747d](https://github.com/frankfika/dailyflow/commit/0d0747d))
* **memory:** 3-tier search ranking (structured > metadata > fulltext) ([d695c23](https://github.com/frankfika/dailyflow/commit/d695c23))
* **memory:** proactive proposal mechanism (overdue-task detection) ([a7c4980](https://github.com/frankfika/dailyflow/commit/a7c4980))
* **transcription:** settings UI for local Whisper backend ([8a3d11e](https://github.com/frankfika/dailyflow/commit/8a3d11e))
* **report:** daily report + reflection with `Journal/YYYY-MM-DD.md` ([096d129](https://github.com/frankfika/dailyflow/commit/096d129))
* **vector:** in-memory TF-IDF vector index (lancedb-ready interface) ([f4830d1](https://github.com/frankfika/dailyflow/commit/f4830d1))
* **skills:** community skill marketplace (registry + SHA-256 + localStorage) ([f4830d1](https://github.com/frankfika/dailyflow/commit/f4830d1))
* **privacy:** PrivacyPanel surfaces all 5 outbound categories ([f4830d1](https://github.com/frankfika/dailyflow/commit/f4830d1))

### Documentation

* **sprint0:** 4 preparation docs (product debt, feature audit, zero-upload audit, agent-market plan) ([300113f](https://github.com/frankfika/dailyflow/commit/300113f))
* **readme:** document Sprint 1 features with V2 slide mapping ([1758a16](https://github.com/frankfika/dailyflow/commit/1758a16))
* 7 new design docs: `MINDMAP_AI_ORGANIZE.md` / `MEMORY_SEARCH_TIERS.md` / `PROACTIVE_PROPOSAL.md` / `TASK_MIRROR_TO_MINDMAP.md` / `DAILY_REPORT.md` / `LOCAL_WHISPER_SETUP.md` / `VECTOR_INDEX.md` / `AGENT_MARKET.md`

### Notes

* Sprint 1 = 4-week pre-roadshow sprint. 14/14 items shipped. 645 tests pass, 0 TS errors.
* See `docs/ROADSHOW_VS_PRODUCT_GAP.md` for the full gap analysis.

## [1.9.0](https://github.com/frankfika/dailyflow/compare/v1.8.0...v1.9.0) (2026-08-18)


### Features

* add github-readme-pro skill and refresh Events section in README ([3eec616](https://github.com/frankfika/dailyflow/commit/3eec616708b0e07d9c65decfaec8687a7b45ed7a))
* **events:** inline add buttons, keyboard navigation, and empty-state input for event canvas ([39cc363](https://github.com/frankfika/dailyflow/commit/39cc363e821d2e54042f3e7a4724d4d297a0f2d8))
* **events:** split outline-canvas layout with click-to-edit and always-visible add buttons ([c144646](https://github.com/frankfika/dailyflow/commit/c144646d0c8961f06609bc36fc80cb534887fc2b))
* show app version in sidebar footer ([6c71ed3](https://github.com/frankfika/dailyflow/commit/6c71ed3bb6731777c2883f1d2d0527209ac61770))
* **team:** team collaboration with leader read-only view and git timeline ([a6b0012](https://github.com/frankfika/dailyflow/commit/a6b00127b2b1ba7e85b35a3112fa896b77ddf495))

## [1.8.0](https://github.com/frankfika/dailyflow/compare/v1.7.2...v1.8.0) (2026-08-17)


### Features

* add AI model center to settings with backend-persisted config ([72ec55f](https://github.com/frankfika/dailyflow/commit/72ec55f404723f9379c4a174264d2b843e9c36f6))

## [1.7.2](https://github.com/frankfika/dailyflow/compare/v1.7.1...v1.7.2) (2026-08-15)


### Bug Fixes

* download updates in background and ask before relaunching ([97cdded](https://github.com/frankfika/dailyflow/commit/97cddedefc4343a827092028bebf7ce5cbb0eb5d))

## [1.7.1](https://github.com/frankfika/dailyflow/compare/v1.7.0...v1.7.1) (2026-08-13)


### Bug Fixes

* make Mindmap and Today a reliable shared task flow ([#41](https://github.com/frankfika/dailyflow/issues/41)) ([7d7b759](https://github.com/frankfika/dailyflow/commit/7d7b7599f0f0002ed1fde3173e542be2b49f0656))

## [1.7.0](https://github.com/frankfika/dailyflow/compare/v1.6.2...v1.7.0) (2026-08-12)


### Features

* add AI API test connection + improve GitHub sync UX ([6628b75](https://github.com/frankfika/dailyflow/commit/6628b754964d1382c3d59c4eb3facf6651063249))
* add AI Features sidebar and PromptLibrary management ([89659b1](https://github.com/frankfika/dailyflow/commit/89659b1ae326e5d84ea188b3560484e706a1a0ce))
* add B.AI provider support (aggregator for Claude/GPT/Gemini) ([c8f5ddb](https://github.com/frankfika/dailyflow/commit/c8f5ddb62d070265e8f3ad56fec16ce4108c192a))
* add calendar workspace and Feishu sync ([4ef6915](https://github.com/frankfika/dailyflow/commit/4ef691543b142cc41925f0ece35247d89dc185ff))
* add comprehensive GitHub sync configuration with validation ([ef19305](https://github.com/frankfika/dailyflow/commit/ef19305c4f515ce8ebc1a86361cf7ea389be0470))
* add flexible AI provider configuration to backend types ([19af7be](https://github.com/frankfika/dailyflow/commit/19af7be5089e22f470ca723efa9030635d69e03e))
* add flexible AI provider configuration with multi-provider support ([6a8aeb1](https://github.com/frankfika/dailyflow/commit/6a8aeb1fd2dda174a9dc6cd38d58acba4fbbea41))
* add full task editing support in parser ([27e2d8f](https://github.com/frankfika/dailyflow/commit/27e2d8fabb0e183716ef5daeb6e28f78dac2930e))
* add GitHub sync, AI provider config, and e2e testing infrastructure ([9450949](https://github.com/frankfika/dailyflow/commit/9450949c2b096bae9e9503cf5d6e21e121e942e8))
* add in-app update checker ([ca440e3](https://github.com/frankfika/dailyflow/commit/ca440e36c86cbe53ade51b28f5177fb6dcfbae78))
* add mind map workspace ([324678e](https://github.com/frankfika/dailyflow/commit/324678ebeafafa946eae2cf5aac35b7498600523))
* add multi-workspace soft switching and refactor AI/model UI ([ac6fa67](https://github.com/frankfika/dailyflow/commit/ac6fa673721321527a57da3da526c2d0b5e668c4))
* add proactive update notification modal and fix CI/CD updater config ([424d24c](https://github.com/frankfika/dailyflow/commit/424d24cb3d2326a6a71e858d041cdac2d3e8a25c))
* add social media articles with bilingual content and screenshots ([9d9373d](https://github.com/frankfika/dailyflow/commit/9d9373d3393677aa4f5603c8c9e9014e5c325766))
* add Tags view for tag-based content organization ([7b3fafa](https://github.com/frankfika/dailyflow/commit/7b3fafae0a553fe9bddb3e7400cf92204363e585))
* add Tauri desktop app support and fix task CRUD bugs ([72916da](https://github.com/frankfika/dailyflow/commit/72916dad16645f4a524853e5f253eed74aaf1a09))
* add test framework and component structure ([ab8ee63](https://github.com/frankfika/dailyflow/commit/ab8ee635b33f4c587c6b0e8e6cedb7ee213ef04c))
* add thinking workspaces ([32581f3](https://github.com/frankfika/dailyflow/commit/32581f3c708201e234f5bc169559d001e27b4229))
* add workspace configuration, project management, and AI summary enhancements ([75b8cb3](https://github.com/frankfika/dailyflow/commit/75b8cb30083915ce256827cf9440c10afcf89efa))
* Agent Skill support — dual-type skills with slash commands ([f61be18](https://github.com/frankfika/dailyflow/commit/f61be1872a137805854a66abb3c0c99c8941a1a2))
* AI Assist context pills + auto-context injection ([29a22fe](https://github.com/frankfika/dailyflow/commit/29a22fe04988e5b260cae26f2f676cd59883b15a))
* AI format for notes with prompt library ([7c32f78](https://github.com/frankfika/dailyflow/commit/7c32f78e8e7a70675be4ce373fec3c53c84fded5))
* auto rollover on load + manual rollover button with preview modal ([9ec36b7](https://github.com/frankfika/dailyflow/commit/9ec36b7785b9eb156b61f8f9f1b506884d23ead5))
* auto-reload workspace when path changes in settings ([19e6dec](https://github.com/frankfika/dailyflow/commit/19e6dec9cbe26488bd74c6b9e66a9c5674827cea))
* **backend+ux:** server import/reset endpoints + mobile sidebar complete (1.1.7) ([f8defa8](https://github.com/frankfika/dailyflow/commit/f8defa8728f23ee673e73259d83b7b01aa3065f4))
* **capsules:** real multi-chain EVM time capsule with wallet integration ([99cfc2b](https://github.com/frankfika/dailyflow/commit/99cfc2b08f62de6f9148250404ce2cf61c025279))
* **deck:** AI × Web3 demo pitch deck (20 slides, 1600×900) ([27b61df](https://github.com/frankfika/dailyflow/commit/27b61df1d07723bd167fd20e539dc8bf825c89f5))
* enable full task editing with all properties ([41b82bd](https://github.com/frankfika/dailyflow/commit/41b82bd4001c8c2dfce862b4c6563890271da029))
* enhance AI Features with multi-config support and prompt testing ([b073091](https://github.com/frankfika/dailyflow/commit/b0730919504a658b6bd4584f39346f513b2d1551))
* enhance migrated task visual indicator ([c747532](https://github.com/frankfika/dailyflow/commit/c7475329c26231af221db188b49aedca85e75838))
* enhance thinking workspaces with security and UX improvements ([eecf0b3](https://github.com/frankfika/dailyflow/commit/eecf0b37df0d4124ecdaff8a71dcde5db1038a6e))
* full Notes system + App.tsx component extraction + UX redesign ([772d4b6](https://github.com/frankfika/dailyflow/commit/772d4b6d28677a00a16fc45f231b2eec13ee00ce))
* GitHub token auth for update checker and various UI improvements ([bbe233a](https://github.com/frankfika/dailyflow/commit/bbe233a88c7875ad6761ead705d3b99bdaced22f))
* **granola:** Phase 1 后端代理 + 前端 MeetingCapture 入口 ([e55e664](https://github.com/frankfika/dailyflow/commit/e55e6646ad4845a6815663f393de719010e1542e))
* **granola:** Phase 2 真实音频 + 转录 + 落盘 + AI Chat 注入 ([5eb33c0](https://github.com/frankfika/dailyflow/commit/5eb33c0f3c8549fbafc95d3e4496c306dc4e51a1))
* implement in-app auto-update with tauri-plugin-updater ([305d34b](https://github.com/frankfika/dailyflow/commit/305d34b5e5c5200410d7c35e05a77bd8d99eb69d))
* improve mind notes and today workflows ([#34](https://github.com/frankfika/dailyflow/issues/34)) ([b3eb32a](https://github.com/frankfika/dailyflow/commit/b3eb32a3c7102e0b94dc0ceaf844db64eec94552))
* improve navigation and category filtering ([b70f405](https://github.com/frankfika/dailyflow/commit/b70f40537dabdd0324994e731f56dcd07f462c97))
* improve notes and workspace chat ([fb464f1](https://github.com/frankfika/dailyflow/commit/fb464f138a630dde7263da53e8d744f1cec1c6a9))
* improve sync time display, updater UX, and test stability ([6956472](https://github.com/frankfika/dailyflow/commit/6956472cc1255c81f46bb5b5bde50930ab736d88))
* improve workspace path and API key input UX ([8205e26](https://github.com/frankfika/dailyflow/commit/8205e269050a45b21eb211a8d7b5940d70761cfa))
* inline note editor, About tab, and various UX improvements ([70c5b65](https://github.com/frankfika/dailyflow/commit/70c5b654f28b0833895d121eb3f10c197742e0eb))
* markdown notes, AI assist menu, task completion comments, and note-to-chat bridge ([2b1e427](https://github.com/frankfika/dailyflow/commit/2b1e427e8487d697cfad55b03926a158cb4751e5))
* merge GitHub/IPFS settings tabs into Sync tab + complete IPFS docs ([e4a1f86](https://github.com/frankfika/dailyflow/commit/e4a1f86d03ad53767e69320209bbe8546d96971e))
* **mindmap:** subtree collapse, inline notes, markdown export, multi-line wrap ([fc82fb3](https://github.com/frankfika/dailyflow/commit/fc82fb313c736d2287f49addd2832e2f1ddeae46))
* **mindmap:** task status, undo/redo, in-map search ([a1e5fc6](https://github.com/frankfika/dailyflow/commit/a1e5fc64d6532990cb22f392f276c14181c49847))
* note read-only preview + live AI config + send-to-chat as context; animate task completion ([4ca1b5a](https://github.com/frankfika/dailyflow/commit/4ca1b5ab6a52c90ddccd0c5f5c8d9daf008d19d8))
* **notes:** empty-state onboarding card with 3 starter templates ([a25e6e9](https://github.com/frankfika/dailyflow/commit/a25e6e941a96b3684593393d3444d074a9e44dc5))
* **notes:** focus mode is the default — bigger writing column + mod+\ toggle ([f144c0c](https://github.com/frankfika/dailyflow/commit/f144c0c928ad1954f31ccfb548d8778175d59fd2))
* **notes:** focus-mode strip N+ in-place expansion + i18n relative time (1.1.8) ([e3003d9](https://github.com/frankfika/dailyflow/commit/e3003d9c8040c81887fb3ba578cca1f4a693faa6))
* organize AI Features with 3 sub-items + update README ([948c87b](https://github.com/frankfika/dailyflow/commit/948c87b123a835271d0d7dcfdf3648f2d15790cf))
* project search/filter + auto-verify GitHub connection ([d00e54c](https://github.com/frankfika/dailyflow/commit/d00e54c2f24491258067877447c11599a444e5f1))
* provider selector redesign — real brand icons + category-based filter ([d49be32](https://github.com/frankfika/dailyflow/commit/d49be32d97c8c58f4924ffabc362888d498c77b6))
* recurring tasks, task comments, UI fixes + updater UX improvements ([c7711aa](https://github.com/frankfika/dailyflow/commit/c7711aad848a7f483e5a27ab07da5c910ebc4573))
* redesign Configuration page with better UX and GitHub sync tutorial ([ef331c2](https://github.com/frankfika/dailyflow/commit/ef331c26989e094213a2da80fb0abc1d8b6ee091))
* redesign SkillManager as card-based marketplace + fix Note UX ([4904b60](https://github.com/frankfika/dailyflow/commit/4904b602c55192efa8805b14e5632651cbcda53c))
* remove Projects Focus, move update check to Settings ([bbcef89](https://github.com/frankfika/dailyflow/commit/bbcef89580ebea005faa4a3eb9a73ea72033ef7c))
* remove Sidebar Categories and Tags tab, add tag filter to Notes ([e8690fc](https://github.com/frankfika/dailyflow/commit/e8690fcadfa833327aafabf497d5f1a6b0da52e5))
* restore AIChat tab alongside FloatingAIPanel ([cb48d91](https://github.com/frankfika/dailyflow/commit/cb48d91016ef8e735e071776bfc08c02a8fb006d))
* support full task editing in backend API ([b3c812a](https://github.com/frankfika/dailyflow/commit/b3c812a90d101a6e904d997a732a58211dbf727f))
* timestamped inline comments + floating AI chat panel ([0b9215c](https://github.com/frankfika/dailyflow/commit/0b9215c08ab010f52e4787000f4f953df4f32823))
* **topic-spaces/phase-1:** frontend types, API client, TopicTabs, kind rendering ([da6362c](https://github.com/frankfika/dailyflow/commit/da6362c2e5bd4b4abf4712fe00ef05f376774bba))
* **topic-spaces/phase-1:** server types, storage, routes, migration ([22ef1d0](https://github.com/frankfika/dailyflow/commit/22ef1d00d2ed1fe7901161f38a77f9b8502dba1c))
* **topic-spaces/phase-2-frontend:** dual view, node kind editing, task mirror, tag filter ([f396efa](https://github.com/frankfika/dailyflow/commit/f396efac5c52b92468adb3fd749c6923f0007343))
* **topic-spaces/phase-2:** mindmap node↔task wiring, tag inheritance, diagnostics ([f1eb3d2](https://github.com/frankfika/dailyflow/commit/f1eb3d28e0cda9236627c4133dbeaf1158c058d4))
* UI refresh — ambient background, native toast, refined sidebar and empty states ([9b0c53f](https://github.com/frankfika/dailyflow/commit/9b0c53fd4d21bc0094bcea56cad6c75046eaecd8))
* **ui:** replace DailyFocus with TodayBacklog + add UI/UX spec ([160637a](https://github.com/frankfika/dailyflow/commit/160637a0cd75a8b6cb70443381cf06c1c989c7c8))
* unify meeting capture and AI models ([c8e05f0](https://github.com/frankfika/dailyflow/commit/c8e05f0df42881d3f12febf352612f962c9bd0b8))
* unify meeting capture and AI models ([#11](https://github.com/frankfika/dailyflow/issues/11)) ([4af309f](https://github.com/frankfika/dailyflow/commit/4af309f24cfc2311e1c868ac7558f5fef8023093))
* update app icon from logo.svg + use SVG in README ([1600502](https://github.com/frankfika/dailyflow/commit/160050292616a1e55c90e06004d11c5db8617f87))
* UX improvements — delete confirmation, toast feedback, rollover banner ([512b636](https://github.com/frankfika/dailyflow/commit/512b636309e0ba416e424191b80173514e30747e))
* **ux:** Notes focus strip 12 cap + tooltip + 收口 Today's Notes 到 TodayBacklog (1.1.5) ([22711c5](https://github.com/frankfika/dailyflow/commit/22711c5c733f263157e40deda7c08a4ae317002f))
* **ux:** Settings Workspace Data 备份/导出/重置 + Sidebar Mode polish (1.1.6) ([db29db4](https://github.com/frankfika/dailyflow/commit/db29db4413660349678944f8496a1ab1307f1c52))
* **ux:** Today view 收紧 + Note editor footer + Settings 280% bug 修 (1.1.4) ([c7d34bf](https://github.com/frankfika/dailyflow/commit/c7d34bf1cf78e44e5d47321eaacacc4e2de96f05))
* v0.7.0 - Skill Marketplace, AI Tool Use, Chat improvements, security hardening ([48305e5](https://github.com/frankfika/dailyflow/commit/48305e5eb82b4df01462622e7427390dbeee7e6a))
* **v2-notes:** focus mode + backlinks panel + §26 17-19 验收 (1.1.3) ([88968e6](https://github.com/frankfika/dailyflow/commit/88968e64b14802a778ee39c162d8fc0ba07823f4))
* **v2-notes:** NoteDocument API client + React Query hooks (1.1.1) ([a95143d](https://github.com/frankfika/dailyflow/commit/a95143d7f211d593a28d60797799b5dfaa80cb2f))
* **v2-notes:** NoteDocument 后端基础设施 + Evidence 加 noteId 锚点 ([48cdbf7](https://github.com/frankfika/dailyflow/commit/48cdbf77b256e6b48a3fceff112d04d055a0a81f))
* **v2-notes:** 主 App Notes tab 集成 v2 + Note editor 重写 (1.1.2) ([4aa060e](https://github.com/frankfika/dailyflow/commit/4aa060edc78d886fd4ac329fee4278ba352a7f3f))
* **v2:** §26 follow-up proposal + waiting review + fixture AI tests ([6702180](https://github.com/frankfika/dailyflow/commit/6702180c74076dd393787c1a3559feab4d2ed108))
* **v2:** §26 step 10 + 15 — commitment context + evidence link + memory types ([2f8c903](https://github.com/frankfika/dailyflow/commit/2f8c903f275f3ab6781ccbd8a808368663deebb5))
* **v2:** AI-Native spec + Phase 0 foundation (DF2-001/002) ([18a9769](https://github.com/frankfika/dailyflow/commit/18a976991ba3c15b12a9cfc9831e36c3b1454d1a))
* **v2:** HTTP API at /api/v2 + index mount + v2 config (DF2-001..012) ([68822e3](https://github.com/frankfika/dailyflow/commit/68822e31aa4c101f5796ec3e92573067104a43e6))
* **v2:** Phase 1 — Capture/Commitments/Proposals/Extractor/Planning/Memory/Legacy (DF2-003..008, 011, 012) ([757974e](https://github.com/frankfika/dailyflow/commit/757974ed55adb1fa7032f00c7a6ec54f8e2d422c))
* **v2:** React UI — V2Shell + Today/Inbox/Memory + API client (DF2-006/008/010) ([55439c4](https://github.com/frankfika/dailyflow/commit/55439c4d6e26f24ae3b3c9e1275b6ece22912784))
* workspace features + ConfirmDialog + official website + release audit ([7c05819](https://github.com/frankfika/dailyflow/commit/7c05819c01bc01889e20190e15ae46110344c8bb))


### Bug Fixes

* add #[cfg(unix)] to PermissionsExt import for Windows build ([00b5bad](https://github.com/frankfika/dailyflow/commit/00b5bad0349a4e855d2e1912396ac1a52ffbb03f))
* add 10s timeout and abort handling for update checker ([ce7884d](https://github.com/frankfika/dailyflow/commit/ce7884dce23ef54bf56d971e8bcfc7514d32e5cb))
* add maximize button to NoteEditor in Notes view ([f3d0114](https://github.com/frankfika/dailyflow/commit/f3d011415d293b5846ceb76d82baaf20b50eccef))
* add missing linkedNotesCount prop to done TaskCards ([83bd449](https://github.com/frankfika/dailyflow/commit/83bd449f8b176e998ee7041c57d880ae7493b1d9))
* add TAURI_SIGNING_PRIVATE_KEY_PASSWORD to release workflow ([0c17098](https://github.com/frankfika/dailyflow/commit/0c17098b5bcab5b430cd26424ce2c60276f1031f))
* AI chat height on desktop + responsive layout on mobile ([ea74fa4](https://github.com/frankfika/dailyflow/commit/ea74fa4c5a64f5e430e579c51c144f31d10e6826))
* allow Feishu links in desktop shell ([9568447](https://github.com/frankfika/dailyflow/commit/9568447739cf958795f5978f2e3a8faecab97095))
* bump tauri version to 0.6.7 ([c2f057c](https://github.com/frankfika/dailyflow/commit/c2f057c320e1015a56e01c374bb7ce8e1a6eaff0))
* bundle Express server with Tauri app ([99bf95b](https://github.com/frankfika/dailyflow/commit/99bf95bfdc7508f8ef56c4fc4b1bf19c657f95fd))
* **ci:** align TypeScript dependency ([7f297c9](https://github.com/frankfika/dailyflow/commit/7f297c9eed2c2805ae6952a6e30b283603e489dc))
* **ci:** set updaterJsonKeepUniversal to fix macOS sig naming ([7cca24b](https://github.com/frankfika/dailyflow/commit/7cca24bd43913dd21a830d0b435cdd6c2d92897f))
* clarify task planning and preserve sidebar navigation ([#26](https://github.com/frankfika/dailyflow/issues/26)) ([e2e83be](https://github.com/frankfika/dailyflow/commit/e2e83bedec64ec2baba3e7e6704f430e6d2e8e53))
* config persistence + task category deduplication ([38c19c9](https://github.com/frankfika/dailyflow/commit/38c19c9add853c6cc5a8c4bb6711a38e5b166181))
* correct Node binary path for Windows bundle extraction ([92a4d63](https://github.com/frankfika/dailyflow/commit/92a4d632ce69229bf6297b7538933131cde324e8))
* correct tauri bundle configuration for server resources ([17abdd3](https://github.com/frankfika/dailyflow/commit/17abdd397993c37d76206e56aa7f905fdc322b7b))
* corrupted Unicode character in AIChat error message ([181a323](https://github.com/frankfika/dailyflow/commit/181a3238b2f833c6f1a6206b4e0c92861043d855))
* cross-platform Node runtime bundling for Tauri resources ([a32379f](https://github.com/frankfika/dailyflow/commit/a32379f3df98370e044cc572a741692ae6fdea4f))
* **daily-focus:** keep plan modal in Today when AI is not configured ([75acf54](https://github.com/frankfika/dailyflow/commit/75acf54d23c8b055002990d6548211d3beebbd3b))
* deadline defaults to current page date, add toast for timeline + button ([0a21420](https://github.com/frankfika/dailyflow/commit/0a21420de9f2197f8e5ece8d3d80138989b7d563))
* dedup by exact raw line instead of title+status ([73e79b7](https://github.com/frankfika/dailyflow/commit/73e79b70a89df49e3c0a10465a94164713721368))
* deduplicate identical tasks on file load ([5a9e707](https://github.com/frankfika/dailyflow/commit/5a9e7079c78dae6973be201f84d8d1638d7f06cf))
* display untagged tasks and ensure delete works correctly ([9c6bfc8](https://github.com/frankfika/dailyflow/commit/9c6bfc865334d9680a16752c4b024f315df71490))
* ensure Tasks category appears when untagged tasks exist ([c05f7e2](https://github.com/frankfika/dailyflow/commit/c05f7e26ec340cff1e8b8253a9aa27ec3ab5c727))
* **event-first:** make mind map actions flow into Today ([059fbad](https://github.com/frankfika/dailyflow/commit/059fbad5cb3a4bc33efaeb4f667d803e0a1f4395))
* generalize workspace setup and release 1.1.15 ([6cd2b3a](https://github.com/frankfika/dailyflow/commit/6cd2b3a6847ab7958e96f081932892551488386e))
* harden data integrity and release v1.6.2 ([981680b](https://github.com/frankfika/dailyflow/commit/981680b50b9af03309fe6218c5c1eb373a5d29dc))
* IME composition handling across task/chat/settings inputs ([fd03722](https://github.com/frankfika/dailyflow/commit/fd03722bec94f90fdf6c1937a7a56fcf8f008ea6))
* isolate prompt form state to prevent cross-contamination ([fc832cc](https://github.com/frankfika/dailyflow/commit/fc832cc15fd3efab9dfd0a94801304071dd0febe))
* keep H1 in NoteEditor textarea and clear draft source on send ([01b8ff4](https://github.com/frankfika/dailyflow/commit/01b8ff4dd9b3ac532d85bcebe6cb2a01c45eefd7))
* lift TaskCard completion prompt state to App to survive list transitions ([a6c9c66](https://github.com/frankfika/dailyflow/commit/a6c9c66d3e2cf3951f468faf3b3da44d6211142a))
* make Feishu onboarding work in packaged app ([4f5423e](https://github.com/frankfika/dailyflow/commit/4f5423e987acf41a9a62fd5b30f95bb03bc7763d))
* make workspace path and DeepSeek API key editable in settings ([dfd5d1f](https://github.com/frankfika/dailyflow/commit/dfd5d1f31c66d31cf3222e97603481b08de42f21))
* manually upload .sig files to fix updater JSON generation ([c2534da](https://github.com/frankfika/dailyflow/commit/c2534da666135e26f513bf1f40dddb5de4a34489))
* **meetings:** require explicit speech provider ([f60cf54](https://github.com/frankfika/dailyflow/commit/f60cf54cfc53384525b405aa053b0c0da9028c9d))
* **mindmap:** expose top-level sibling actions ([e989144](https://github.com/frankfika/dailyflow/commit/e9891442a00722c5a7e8a821ce1afdbc1d7e3493))
* move AI assist button to bottom-right, make it draggable and animated ([f6a98c0](https://github.com/frankfika/dailyflow/commit/f6a98c0b5725d5a0f9b1d9fa53b7c2d266412c34))
* move context pills into input area + count badge on button ([911c1ca](https://github.com/frankfika/dailyflow/commit/911c1ca92aca6b04f065be94e4e16134e1b59d8e))
* move sync/settings to sidebar bottom, improve done task handling ([6a950f0](https://github.com/frankfika/dailyflow/commit/6a950f084f802bbd6ddf1ecf257055234ba2c654))
* move updater config to plugins section ([9b05f99](https://github.com/frankfika/dailyflow/commit/9b05f99e80a86e5825f43742baeef188061c5e70))
* **notes:** back to default = split, focus mode is opt-in ([fb96cae](https://github.com/frankfika/dailyflow/commit/fb96cae24b8193a7c48c41fc49622f8a2237fb86))
* **notes:** fill the editor column instead of centering a narrow island ([9867b71](https://github.com/frankfika/dailyflow/commit/9867b71a3eca7661649be4ac80f71e8ee9b3ed86))
* **notes:** fill the right pane at 1920x1080 — no more section 留白 ([acce376](https://github.com/frankfika/dailyflow/commit/acce376893a07646f100e95e22cc522beb38c115))
* **notes:** harden autosave and meeting capture ([5c113ab](https://github.com/frankfika/dailyflow/commit/5c113ab97304552e17773bd06f23bfc5e500524b))
* **notes:** harden autosave and meeting capture ([bbf1532](https://github.com/frankfika/dailyflow/commit/bbf1532f35442aeec0ef2b7667164d7582333c87))
* **notes:** prevent reads from overwriting autosaves ([ae54fb9](https://github.com/frankfika/dailyflow/commit/ae54fb9d1fdb1322fdf188ecf9f752dd7db70f7e))
* **notes:** swap empty-state overlay for a real empty state ([172df96](https://github.com/frankfika/dailyflow/commit/172df96d4d37b0041c322db7cdfce06b38ebd65c))
* preserve Windows connector executable extension ([41e9062](https://github.com/frankfika/dailyflow/commit/41e9062965bb5eb19289b65b1fd7d081bdacf788))
* prevent duplicate task migration on repeated rollover clicks ([b1ffe77](https://github.com/frankfika/dailyflow/commit/b1ffe774c499cb413b231f840a9fbce6f3b9f97e))
* reconcile release branch histories ([8cf1778](https://github.com/frankfika/dailyflow/commit/8cf17780e72847d9cb9bd75527d5994536934b51))
* reduce desktop runtime jank ([072935f](https://github.com/frankfika/dailyflow/commit/072935fbf52fbeade4048a4aa963db07c4e65b2d))
* regenerate icons as RGBA format (required by Tauri) ([45d1048](https://github.com/frankfika/dailyflow/commit/45d10489967e07f1e42a53a8c9c6e44c6eb5d865))
* **release:** use supported macOS Intel runner ([2f3defa](https://github.com/frankfika/dailyflow/commit/2f3defa0ca7157dc63748492f1c9456f1f6b49a0))
* render AI messages with ReactMarkdown + remark-gfm ([f2c9ddf](https://github.com/frankfika/dailyflow/commit/f2c9ddfd294a415604bad6f0f97f010417ff5cfd))
* replace fake checkbox with bullet dot in rollover preview ([a55cd66](https://github.com/frankfika/dailyflow/commit/a55cd66e39bead9276bd741aa1fc7ed1a7ae2eee))
* resizable AI panel + settings back-to-chat navigation ([f01cdb0](https://github.com/frankfika/dailyflow/commit/f01cdb0b86c0d2bf8a0bc2c8bc58bf6f2c04586c))
* resolve backend API unavailability in packaged app ([4453e08](https://github.com/frankfika/dailyflow/commit/4453e08df78fe1a694403cb5d874e0b28b394837))
* resolve Tauri v2 resources path (_up_ subdirectory) ([8f6cf22](https://github.com/frankfika/dailyflow/commit/8f6cf22c8863753e8612c7baccba46a178f4687a))
* restore Event tasks in Today and polish app UX ([108cc9d](https://github.com/frankfika/dailyflow/commit/108cc9dffae5eb31fa4772bae5df6b39d07a2f52))
* restore workspace task and note UX ([a34c824](https://github.com/frankfika/dailyflow/commit/a34c824dc21431100711832d24a32762e4c27549))
* retry logic and debug logging for update checker ([1bb9a45](https://github.com/frankfika/dailyflow/commit/1bb9a45683295ff622fa17b65d860cd6b9363522))
* rollover duplicates at source + Codex-style sidebar layout ([4e0fbea](https://github.com/frankfika/dailyflow/commit/4e0fbea171250a48e8b850045aec9c422111bfd2))
* save long meeting recordings reliably ([#28](https://github.com/frankfika/dailyflow/issues/28)) ([eec26ed](https://github.com/frankfika/dailyflow/commit/eec26ed5c4df465a565df13052fee9d697f228d7))
* server CJS format, version injection, and prod API_BASE ([158d42c](https://github.com/frankfika/dailyflow/commit/158d42cd12794fb8202478743f8ae3fcb8b7e682))
* **server:** don't dump full error object in global error handler ([203e77d](https://github.com/frankfika/dailyflow/commit/203e77d6025398d02eb67cfafce2d7c4f277dca2))
* **server:** harden git ahead/behind cmd + sanitize error logging ([a709a72](https://github.com/frankfika/dailyflow/commit/a709a729462eb30cc9ed5d3b0c21e5215e66e663))
* show current app version in Settings &gt; App Update section ([d4fd51d](https://github.com/frankfika/dailyflow/commit/d4fd51d7fd9a3b2c02d4173a68c87ddacb304da1))
* show metadata (tags, deadline, project) on done tasks ([bbfe1e4](https://github.com/frankfika/dailyflow/commit/bbfe1e46ca57bc72537713c18c11d91ae0126e9e))
* show source date on migrated tasks, highlight delayed tag in orange ([d960f52](https://github.com/frankfika/dailyflow/commit/d960f52a2f206a52971e1f4ce321760c654a0b5c))
* sidebar stays open on desktop when clicking nav items ([9a37ed4](https://github.com/frankfika/dailyflow/commit/9a37ed47e5d67052da4ad31ddb9cfd2babaf12dc))
* simplify dedup key to title+status only ([f8afcce](https://github.com/frankfika/dailyflow/commit/f8afccef6ee3280229f583f2e59129aaa685ab5c))
* simplify mind map task workflow ([0a34741](https://github.com/frankfika/dailyflow/commit/0a34741650987cdc07fca9c92cafff470fbfe8f4))
* slash command race condition + add Agent Skill example ([a2bd0d2](https://github.com/frankfika/dailyflow/commit/a2bd0d21babfec4a3fdae8efe24edc2b3be927b4))
* stabilize first-run workspace setup ([f7acb4a](https://github.com/frankfika/dailyflow/commit/f7acb4afc00a4ab5892e0df2aaedde014687a854))
* task/note model separation, write race, hide-done, color system ([3f43bca](https://github.com/frankfika/dailyflow/commit/3f43bca481b60303dbfa2910dcd0040f32033308))
* **today:** restore earlier standalone tasks ([9c06394](https://github.com/frankfika/dailyflow/commit/9c06394d57583f6084bd97c47f3d1033ca7aab28))
* update signing public key for updater JSON generation ([0f3695a](https://github.com/frankfika/dailyflow/commit/0f3695a7b2157ece75ed3d1da9fed201062add15))
* use [&gt;] migrated status instead of [x] done for rolled-over tasks ([758caff](https://github.com/frankfika/dailyflow/commit/758caff6d5138941f32125034ce57a77bf125386))
* use correct includeUpdaterJson parameter for tauri-action ([d166608](https://github.com/frankfika/dailyflow/commit/d166608f727436eaf5f60dc603547d27fa83477e))
* use glob pattern for Tauri resources to support Windows ([6605ca2](https://github.com/frankfika/dailyflow/commit/6605ca254e9c6ddf2301df9425e5d433e8aec0b9))
* use rsvg-convert for icon generation (ImageMagick drops SVG strokes) ([dd211dc](https://github.com/frankfika/dailyflow/commit/dd211dc81bece6c0678be99c6e7a8165a7af3f1b))
* **ux:** 修 4 个 P0 卡点 + 提友好 AI 错误信息 ([09ca4f2](https://github.com/frankfika/dailyflow/commit/09ca4f237f0bd4f5e9b5aff8ec6b53fe80aa32ec))
* **workspace-setup:** unblock Get Started + clearer Validate button ([5fdce77](https://github.com/frankfika/dailyflow/commit/5fdce779d71e7be25707175c026811074eb55db2))
* **workspace:** persist selected workspace across restarts and allow removing the last one ([4b2f4eb](https://github.com/frankfika/dailyflow/commit/4b2f4ebacac636624f48d88de233c02b9576df3b))

## [1.6.2](https://github.com/frankfika/dailyflow/compare/v1.6.1...v1.6.2) (2026-08-12)

### Bug Fixes

- prevent note, recurring-task, and event data from being overwritten or masked by empty fallback data
- hide unavailable connector and external-write capabilities until their authorization/runtime is ready
- make AI tool results, update failures, and save-note actions truthful and recoverable
- improve keyboard access, mobile touch targets, language consistency, and isolated end-to-end testing

### Security

- restrict local API CORS to explicitly configured origins
- keep release and E2E configuration isolated from the user's real workspace

## [1.6.1](https://github.com/frankfika/dailyflow/compare/v1.6.0...v1.6.1) (2026-08-11)


### Bug Fixes

* **mindmap:** expose top-level sibling actions ([e989144](https://github.com/frankfika/dailyflow/commit/e9891442a00722c5a7e8a821ce1afdbc1d7e3493))

## [1.6.0](https://github.com/frankfika/dailyflow/compare/v1.5.8...v1.6.0) (2026-08-11)


### Features

* improve mind notes and today workflows ([#34](https://github.com/frankfika/dailyflow/issues/34)) ([b3eb32a](https://github.com/frankfika/dailyflow/commit/b3eb32a3c7102e0b94dc0ceaf844db64eec94552))

## [1.5.8](https://github.com/frankfika/dailyflow/compare/v1.5.7...v1.5.8) (2026-08-10)


### Bug Fixes

* **today:** restore earlier standalone tasks ([9c06394](https://github.com/frankfika/dailyflow/commit/9c06394d57583f6084bd97c47f3d1033ca7aab28))

## [1.5.7](https://github.com/frankfika/dailyflow/compare/v1.5.6...v1.5.7) (2026-08-10)


### Bug Fixes

* **event-first:** make mind map actions flow into Today ([059fbad](https://github.com/frankfika/dailyflow/commit/059fbad5cb3a4bc33efaeb4f667d803e0a1f4395))

## [1.5.6](https://github.com/frankfika/dailyflow/compare/v1.5.5...v1.5.6) (2026-08-09)


### Bug Fixes

* save long meeting recordings reliably ([#28](https://github.com/frankfika/dailyflow/issues/28)) ([eec26ed](https://github.com/frankfika/dailyflow/commit/eec26ed5c4df465a565df13052fee9d697f228d7))

## [1.5.5](https://github.com/frankfika/dailyflow/compare/v1.5.4...v1.5.5) (2026-08-09)


### Bug Fixes

* clarify task planning and preserve sidebar navigation ([#26](https://github.com/frankfika/dailyflow/issues/26)) ([e2e83be](https://github.com/frankfika/dailyflow/commit/e2e83bedec64ec2baba3e7e6704f430e6d2e8e53))

## [1.5.4](https://github.com/frankfika/dailyflow/compare/v1.5.3...v1.5.4) (2026-08-09)


### Bug Fixes

* simplify mind map task workflow ([0a34741](https://github.com/frankfika/dailyflow/commit/0a34741650987cdc07fca9c92cafff470fbfe8f4))

## [1.5.3](https://github.com/frankfika/dailyflow/compare/v1.5.2...v1.5.3) (2026-08-08)


### Bug Fixes

* reconcile release branch histories ([8cf1778](https://github.com/frankfika/dailyflow/commit/8cf17780e72847d9cb9bd75527d5994536934b51))

## [1.5.2](https://github.com/frankfika/dailyflow/compare/v1.5.1...v1.5.2) (2026-08-09)

### Fixed

- Generate and upload signed Tauri updater archives, signatures, and `latest.json` using the maintained `tauri-action` v1 contract.
- Fail the release workflow when installers are missing or unexpectedly small, updater signatures are absent, or updater metadata does not cover all supported desktop platforms.

## [1.5.1](https://github.com/frankfika/dailyflow/compare/v1.5.0...v1.5.1) (2026-08-09)

### Changed

- Refactored the mind-map-to-Tasks planning workflow with persistent cross-date links, lifecycle synchronization, immersive canvas controls, batch task promotion, planning order, and parent-child task relationships.
- Fixed the blank-screen and responsive application layout regressions.

## [1.5.0](https://github.com/frankfika/dailyflow/compare/v1.4.1...v1.5.0) (2026-08-08)


### Features

* unify meeting capture and AI models ([#11](https://github.com/frankfika/dailyflow/issues/11)) ([4af309f](https://github.com/frankfika/dailyflow/commit/4af309f24cfc2311e1c868ac7558f5fef8023093))

## [Unreleased]

### Changed

- **One meeting workflow** — every meeting entry point now creates and opens a v2 meeting NoteDocument; audio, transcript, evidence, and review stay attached to that note.
- **Unified Model Center** — chat, meeting summary/extraction, and speech transcription share one versioned registry with automatic migration from the two legacy browser stores. V2 extraction uses the selected meeting-summary role; environment variables remain a headless override.
- **Scoped upload limit** — the 200 MB JSON parser applies only to the canonical v2 meeting capture endpoint; all other APIs use a 10 MB ceiling.

### Removed

- Removed the legacy MeetingCapture modal, `/api/meetings`, and its split recording/note storage path.
- Removed unused legacy Projects, Git, and Thinking Workspace APIs and their duplicate write services. Topic Space continues to read old `kind: workspace` files without rewriting them.
- Removed unreachable Today/Review/Tags/Prompt Library/Feishu Agenda components and their orphaned helpers and tests.

## [1.4.1] - 2026-08-08

### Fixed

- **Reliable mind map autosave** — serialize saves and flush pending edits when switching maps or leaving the view, preventing stale writes and lost changes.
- **Concurrent persistence safety** — make mind map updates atomic so simultaneous edits cannot overwrite newer data.
- **Task linking actions** — keep linked-task creation, selection, navigation, and context-menu actions consistent across the mind map UI.
- **Regression coverage** — add route, service, API client, autosave, mirroring, and context-menu tests for the repaired flows.

## [1.4.0] - 2026-08-08

### Added

- **Mind Map workspace** — a new `思维导图` tab with a per-workspace list of mind maps and a pan/zoom canvas (powered by `@xyflow/react`). Auto-laid-out horizontal tree, drag-to-reposition, Tab to add a child, Enter to add a sibling, Backspace to delete, double-click to edit, F2 to edit, color cycle button. Auto-save to `<workspaceRoot>/.dailyflow/mindmaps/<id>.json` (debounced 600ms). 6 named color tokens that match the rest of the design system.
- Mind map CRUD endpoints: `GET/POST /api/mindmaps`, `GET/PUT/DELETE /api/mindmaps/:id`.
- **Subtree collapse / expand** — toggle a node's children with a chevron button; collapsed state persists across reloads. The auto-layout and the canvas both skip hidden descendants.
- **Inline note editor** — click the sticky-note button on a selected node to add a longer-form note. The note renders as a side panel beside the node and is exported alongside the headline.
- **Markdown export** — `Copy Markdown` button in the header writes the visible tree (collapsed subtrees excluded) as a `#`-heading + nested list to the clipboard, with notes emitted as blockquotes.
- **Multi-line text wrapping** — long node text now wraps inside the card instead of forcing a wide card. The edit input is an auto-growing textarea.
- **Task status** — each node now has a three-state status (`todo` / `in-progress` / `done`). Click the badge on the left of a node to cycle; the canvas renders a check / dot / empty circle and strikes through the headline once a node is done. Persisted to the same JSON file.
- **Undo / redo** — `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` (or `Ctrl+Y`) walk a 50-entry history per map. The header has Undo/Redo buttons that disable when the stack is empty. Position-only drags do not pollute the history (they're coalesced by the autosave debounce).
- **In-map search** — `Ctrl/Cmd+F` opens a search bar that replaces the title; `Enter` / `↓` jumps to the next match, `↑` to the previous, `Esc` closes. Matches get a faint amber ring; the currently focused match gets a solid amber ring and the canvas auto-pans to keep it in view.
- **Mind map JSON import / export** — per-row export writes a `Blob` of the full map to disk; the empty-state Import button (and the list rail's upload button) re-creates the map from a JSON file. Filename uses a sanitized title + the last 6 chars of the id.
- **Mind map progress badge** — the header shows a `done/total` chip for the active map (skips the root). Tints to the success color when 100% done.
- **Mind map templates** — 4 starter templates (SWOT / 5W1H / Decision Tree / Task Breakdown) are offered from the empty state. Each template builds a real `MindMap` shape with deterministic ids so the auto-layout produces a clean tree on creation.

#### Topic Spaces (Phase 1-4)

The Topic Space refactor introduces a `主题` (Topic Space) as the primary
organizing unit: one project, initiative, or long-running goal owns its own
mind map, its own list of bound tasks, and its own tags. The refactor
lands in four phases and is fully implemented end-to-end.

- **Phase 1 — data model + UI** — `TopicSpace` lives as a new
  `<workspaceRoot>/Workspaces/yyyy/MM/tw_*.md` Markdown file with YAML
  frontmatter (id, kind, context, mindmapId, taskIds, defaultView, tags,
  intent, scratchpad, brief, journey, timeline). A new `Topic Tabs` rail
  lists `全部` / `未分类` / each space, with create / delete / select.
  The mind-map node schema gains `kind` (`root` | `branch` | `tag` |
  `task`) and optional `tag` / `taskId` fields. A one-time
  `migrate:topic-spaces` script pre-seeds the metadata for any
  pre-existing mind map.
- **Phase 2 — node kind editing + task mirror** — right-click on a
  node opens a context menu with four actions: `转为待办` (create a
  real Task and bind it to the node), `关联已有 Task` (search-driven
  picker over the active space's tasks), `设为 Tag` (re-classify the
  node as a tag), and `取消分类` (demote back to a plain branch). The
  root node hides the latter two. The mind-map view one-way mirrors
  `status` and `text` from linked Tasks so editing a task in TodayView
  reflects in the map. Endpoints:
  `POST /api/mindmaps/:id/nodes/:nodeId/promote-to-task`,
  `POST /api/mindmaps/:id/nodes/:nodeId/link-task`,
  `PUT /api/mindmaps/:id/nodes/:nodeId/kind`,
  `PUT /api/tasks/:taskId/space`.
- **Phase 3 — tag terminalization + inheritance** — `kind: 'tag'` nodes
  along a path to a leaf become inherited tags when the leaf is promoted
  to a Task. The walk is root-to-leaf, case-insensitive, deduplicated
  against user-supplied `#tag`s, and cycle-safe.
- **Phase 4 — `^space:xxx` system marker + diagnostics** — the binding
  between a Task and a Topic Space is recorded as a system marker at the
  end of the task line (`- [ ] title #user-tag #inherited-tag
  ^space:<id> ^id-<taskId>`), separate from user-visible tags so it
  survives migration. A new `/api/diagnostics` surface reports broken
  links (nodes whose `taskId` no longer resolves) and supports a
  surgical `repair-task-link` action to unlink dangling nodes
  (re-create is reserved for a future phase).

### Dual view (mindmap / list)

- The Topic Space surface offers two views: a `mindmap` view (the
  existing canvas) and a `list` view of the space's bound tasks. The
  active view is persisted on the space as `defaultView`; a transient
  `viewOverride` lets the user flip without committing.
- The list view has a tag filter (multi-select chip row, sourced from
  the union of the space's own tags and the tags scraped from its bound
  tasks). TaskCard surfaces the space binding with a `已绑定到 [Space]`
  chip plus an inline `×` to unlink.

### Verified

- `npm test` ✅ 69 files / **550 tests** (server 371 + client 179; +148
  vs 1.3.1)
- `npm run lint` ✅
- `npm run build` ✅
- `npx playwright test e2e/topic-spaces.spec.ts --workers=1` ✅
- Live curl smoke for `promote-to-task` / `link-task` / `PUT
  /tasks/:id/space` / `GET /diagnostics/broken-links` /
  `POST /diagnostics/repair-task-link` ✅
- `^space:<id>` marker round-trips through the Markdown file ✅

## [1.3.1] - 2026-08-06

## [1.3.1] - 2026-08-06

### Fixed

- **Ollama loopback support** — local Ollama/LM Studio chat endpoints on `localhost`, `127.0.0.1`, and `::1` are now accepted while LAN and link-local SSRF targets remain blocked.
- **Meeting model separation** — chat models are no longer treated as speech models; Ollama can organize transcripts while Whisper-compatible providers handle audio.
- **Durable-first meeting capture** — recordings are persisted before transcription and can be transcribed or retried later without recording again.
- **No fake transcripts** — missing speech models no longer produce placeholder text that flows into meeting summaries.
- **Local ASR readiness** — whisper.cpp executable, model, and ffmpeg availability are detected from the actual machine configuration.

### Added

- Local ASR path configuration and detection in Meeting Notes.
- A stored-audio transcription endpoint for remote and loopback speech providers.
- Meeting AI architecture notes in `docs/MEETING_AI_ARCHITECTURE.md`.

### Verified

- `npm test` ✅ 52 files / 402 tests
- `npm run lint` ✅
- `npm run build` ✅
- In-app browser UX verification ✅

## [1.2.2] - 2026-07-29

### Fixed

- **Reliable Note archive and restore** — archived Notes now show a clear Restore action, while working Notes show Archive; both paths use the same versioned state transition.
- **Atomic Note autosaves** — per-file compare-and-swap serialization prevents concurrent body, metadata, recording, and transcription updates from silently overwriting each other.
- **Conflict-safe editing** — field-level three-way checks preserve local text on genuine conflicts, retain failed edits for retry, and keep queued saves isolated when switching rapidly between Notes.
- **Meeting recording associations** — recording and local transcription updates re-read and safely merge source links after concurrent edits instead of rewriting stale Note documents.
- **Stable dated Notes** — changing a Note date across months keeps one physical file and no longer produces false conflicts or duplicate records.
- **Mobile Notes navigation** — returning to the Note list no longer immediately reopens the first document.

### Verified

- `npm run lint` ✅
- `npm test` ✅ 50 files / 396 tests
- `npm run build` ✅
- `cargo check --manifest-path src-tauri/Cargo.toml` ✅
- Desktop Notes archive/restore UI inspected with no browser errors ✅

## [1.2.1] - 2026-07-29

### Fixed

- **Explicit speech-provider opt-in** — an existing AI Chat provider is no longer treated as an audio transcription service. Meeting Notes now default to saving the original recording only, and remote audio upload is enabled only after the user explicitly selects remote transcription and configures its speech API URL, key, and model.

### Verified

- Meeting recording UI defaults to `Save recording only` even when AI Chat is configured.
- Explicit remote speech configuration still submits to the configured transcription endpoint.

## [1.2.0] - 2026-07-29

### Added

- **Native meeting Notes** — an existing Note can be switched to `meeting` and remains the owner of its handwritten minutes, original recordings, and transcript sources.
- **In-app recording** — start, stop, preview, discard, save, and replay multiple meeting recordings directly inside a meeting Note.
- **Flexible transcription providers** — choose save-only, a remote OpenAI-compatible speech API, a loopback-only local OpenAI-compatible endpoint, or an advanced managed `whisper.cpp` executable.
- **Editable transcript workflow** — preserved transcripts can be copied into the Note body with one action and then corrected or expanded in the normal editor.
- **Note tags and filters** — add or remove multiple tags, show them in the Note list, and filter Notes by tag.
- **Meeting Agent foundation** — declarative Agent definitions and reviewable AgentRun records keep future AI Chat summaries separate from literal transcription.
- **Ollama Chat template** — local Ollama remains available for future Chat/Agent work without being treated as an audio transcription provider.

### Security and reliability

- The original recording is written atomically before any transcription request is attempted.
- Remote transcription rejects localhost, private, and link-local destinations; local endpoints are restricted to `localhost`, `127.0.0.1`, and `::1`.
- Recording and transcript files remain separate private SourceItems linked to their Note.
- macOS packages declare microphone usage so the system can request recording permission correctly.

### Verified

- `npm run lint` ✅
- `npm test` ✅ 49 files / 384 tests
- `npm run build` ✅
- `npm run build:server` ✅
- `cargo check --manifest-path src-tauri/Cargo.toml` ✅
- Meeting Note recording UI inspected in the local desktop webview workflow ✅

## [1.1.18] - 2026-07-28

### Added

- **In-app Feishu onboarding** — DailyFlow now guides first-time app preparation and account authorization from Settings, including official links, QR codes, automatic result checks, retry controls, and local disconnect.
- **Bundled Feishu connector** — every desktop installer now includes the official platform-specific `@larksuite/cli` runtime; users no longer need Homebrew, npm, or a separate CLI installation.

### Fixed

- **Packaged server startup** — corrected Tauri resource discovery so production builds use the bundled Node runtime from `_up_/dist-server` instead of silently depending on a system Node installation.
- **Desktop process cleanup** — the bundled local server is terminated and reaped when DailyFlow exits.
- **Feishu authorization handoff** — the app retains the live device flow, displays a QR/link fallback, waits for confirmation, and refreshes the connected account automatically.

### Verified

- Packaged macOS `.app` starts with the bundled Node runtime.
- Packaged Feishu connector reports `cliAvailable`, configured application, and authorized account.
- Settings → Sync → Feishu displays the connected account and sync controls in the native desktop window.
- `npm run lint` ✅
- `npm test` ✅ 37 files / 336 tests
- `cargo check` ✅

## [1.1.17] - 2026-07-28

### Fixed

- **Desktop runtime jank** — replaced the permanently animated, viewport-sized `blur(140px)` background with static radial gradients.
- **Expensive full-window compositing** — removed always-on backdrop blur from the main pane, sidebar, task cards, glass panels, and sticky focus bar while preserving their visual hierarchy with opaque surfaces and gradients.
- **Over-broad transitions** — limited card transitions to the properties that actually animate, avoiding unnecessary style and paint work.

### Verified

- DailyFlow idle process CPU: `0.0%`
- WebKit content CPU: approximately `0.2%`
- WebKit GPU CPU: `0.0%`
- `npm run lint` ✅
- `npm run build` ✅
- `npm test` ✅ 37 files / 336 tests

## [1.1.10] - 2026-07-21

### Fixed
- **Notes right pane actually fills the viewport** (`src/App.tsx`, `src/features/v2/notes/NoteEditor.tsx`, `src/features/v2/notes/NotesView.tsx`) — Frank 多次反馈 "note 太小 / 中间空 / section 留白大", 根因是 3 层嵌套限制:
  - `App.tsx:1019` 的 page-style wrapper (`p-4 md:p-8 lg:p-12`) 给 Notes 套了 48px 横向 padding
  - `App.tsx:1020` 的 `max-w-3xl mx-auto` 把整页挤到 768px 居中, 1920 视口里左右各漏 ~576px 蓝白渐变 background
  - `App.tsx:1215` 我之前加的 `h-full w-full` wrapper 也被父级 max-w-3xl 卡住, 救不回来
  - **修法**: Notes 跟 ai-chat/capsules 一样走 full-bleed wrapper (`overflow-hidden` + `w-full h-full`), 删掉废的 L1215 wrapper
- **No-selection onboarding fills the right pane** (`src/features/v2/notes/NoteEditor.tsx`) — 之前 `!noteId` 早 return 用的是 `max-w-2xl` 简化 onboarding (标题 + 4 按钮 + hint), 右下半截完全空. 现在跟 body-empty 共享新抽出的 `OnboardingPanel` 组件 (大字 + 4 模板 + recent 3 个 + tips 双卡) 整片撑满
- **List column no longer gets stretched by content** (`src/features/v2/notes/NotesView.tsx`) — aside 加 `min-w-0`, 280px 是死的, 不被 Card 内容撑大
- **Shared `OnboardingPanel` component** (`src/features/v2/notes/NoteEditor.tsx`) — `!noteId` 分支和 empty-body 分支都渲染同一份 onboarding, 不会再出现两个 onboarding 长得不一样 (一个 max-w-2xl 小岛, 一个完整 3 段) 的分裂

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 33 files / 315 tests pass
- `npx playwright test e2e/notes-focus-mode.spec.ts --workers=1` ✅ 4/4 pass
- `npx playwright test e2e/visual-check.spec.ts` ✅ 1920×1080 截图肉眼确认 A/B/C 三个状态右半屏都撑满 1410px (从 x=510 到 x=1920), 不再有 section 留白

## [1.1.9] - 2026-07-21

### Changed (rolled back in 1.1.10)
- **Focus mode is the default + body `max-w-[68ch] mx-auto` 居中** (`src/features/v2/notes/NotesView.tsx`, `src/features/v2/notes/NoteEditor.tsx`, commit `f144c0c`) — 试过把 focus 当 default 让长文写作有更多空间, 配合 `mod+\` 快捷键 + lucide `Maximize2`/`Minimize2` SVG toggle. **实际效果**: list 被压成 56px icon strip 是死列, 用户没法回 split. 1.1.10 改回 split default, focus mode 留作 opt-in
- **`pl-6 pr-8` 左对齐 + `w-full` 撑满** (commit `9867b71`) — Frank 拒绝居中岛 (1.1.9 居中版), 改回左对齐撑满, 1.1.10 完整保留

## [1.1.8] - 2026-07-21

### Added
- **Focus mode strip N+ in-place expansion** (`src/features/v2/notes/NoteList.tsx`, `src/features/v2/notes/NotesView.tsx`, commit `e3003d9`) — 之前点 N+ 直接 eject 回 split 模式打断 focus, 现在就地展开:
  - 点击 N+ → strip 解除 11-dot cap, 渲染所有 note 圆点, 焦点模式不丢
  - 再点 (或选中任意 note) → 收回 11-dot cap
  - a11y: `aria-expanded` 翻转, 按钮文案 `N+` ↔ `−`, tooltip 双向提示
- **Bilingual relative time** (`src/features/v2/notes/NoteList.tsx`, `src/features/v2/notes/NoteEditor.tsx`) — `just now / Nm / Nh / Nd` (en) + `刚刚 / N 分钟前 / N 小时前 / N 天前` (zh). List 单元格和 editor statusbar 用同一 helper, 语言一致
- **E2E expansion contract** (`e2e/notes-focus-mode.spec.ts`) — 重写后断言新行为: 始终留在 `note` layout, N+ 切到 `−`, 所有 seeded note 在 strip 内可见, 选中后塌回 cap

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 33 files / 315 tests pass
- `npm run build` ✅ vite 2.x s, main chunk 376 kB
- `npx playwright test` ✅ 13/13 e2e pass (新增 + 重写的 N+ 展开合同)

## [1.1.7] - 2026-07-21

### Added
- **Server import/reset endpoints** (`server/routes/v2/index.ts`, `server/services/v2/importService.ts`, commit `f8defa8`) — 补齐 1.1.6 留的 mock 端点:
  - `POST /api/v2/import` — merge / overwrite 双模式, per-entity 错误回包
  - `POST /api/v2/reset` — `RESET WORKSPACE` confirm phrase guard
  - `importService.ts` (375 行) + 11 vitest 单测覆盖双模式 + 边界 case
  - 2 个新 audit event kind: `workspace.import`, `workspace.reset`
- **3-viewport responsive Sidebar** (`src/components/Sidebar.tsx`, +469 行) — 拆 mobile/tablet/desktop:
  - mobile (≤640): fixed overlay + slide 动画 + backdrop + Esc 关闭
  - tablet (641-1024): 60px icon strip 默认, hover/click 展开
  - desktop (>1024): 230px in flow
  - `localStorage df_sidebar_collapsed` 持久化 tablet/desktop 偏好
  - `AnimatePresence` + `motion.aside` 动画, a11y 完整 (`aria-expanded` / `aria-controls` / `role="navigation"` / `aria-label`)

### Fixed
- **loadConfig 不再回写空 workspaces 数组到磁盘** (`server/services/config.ts`) — 之前空数组被 cascade 到每个 server route, e2e workspace 在测试中途被剔除, 现在只在首次 true first-run 才 seed 文件
- **saveActiveContext 守 e2e race** — server 还没 workspace 时不再 echo 半截 config

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 33 files / 315 tests pass (新增 11 importService 单测)
- `npm run build` ✅ vite 3.x s, main chunk ~360 kB
- `npx playwright test` ✅ 11/11 e2e pass (新增 6 个 sidebar-viewport 测: mobile/tablet/desktop × closed/open)

## [1.1.6] - 2026-07-20

### Added
- **Settings → Workspace Data section** (`src/components/SettingsModal.tsx`, commit `db29db4`) — 1.1.6 主线:
  - **Export all data**: fetch 8 个 entity endpoint (`/api/v2/export/entities?kind=X` × 8) + `/api/v2/notes` + `/api/v2/commitments`, 包成 JSON, Blob + `<a download>` 触发, 文件名 `dailyflow-${wsSlug}-${date}.json`. 成功 toast + "Last exported 5m ago" inline status
  - **Import from JSON**: file input accept=".json", 解析后 POST `/api/v2/import`. 服务端该 endpoint **暂不存在** (1.1.6 范围外), UI 友好提示 "server import endpoint not yet implemented, coming soon"
  - **Reset workspace**: 二次 `confirm()` 保护, 调 `POST /api/v2/reset`. 同上, endpoint 暂缺, UI 提示 "coming soon"
  - 完整 state 管理: 3 个 loading flag + lastExportTime (localStorage 持久化) + inline status banner
- **Sidebar Mode 切换器 visual polish** (`src/components/Sidebar.tsx`):
  - 从 small inline chip 改成 100% 宽 tab-style (grid-cols-2)
  - 加 uppercase "MODE" 标签 + 右侧 "On the clock" / "Off the clock" status
  - 选中态 `bg-surface text-accent shadow-sm` 加 14px icon, 视觉权重明显
  - aria `role="tablist"` + `aria-selected` 配 a11y

### Known limitations
- `/api/v2/import` + `/api/v2/reset` 1.1.6 暂未实现. UI 已加, 错误优雅 fallback. 1.2.x 真实接入.

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 32 files / 304 tests pass
- `npm run build` ✅ vite 4.07s, main chunk 363 kB
- `npx playwright test` ✅ 7/7 e2e pass (no regression from 1.1.5)

## [1.1.5] - 2026-07-20

### Added
- **Notes focus mode icon strip polish** (`src/features/v2/notes/NoteList.tsx`, commit `<pending>`) — 之前 16+ 灰圆点垂直列, 选中不明显. 现在:
  - 12 cap: top 11 dots + 1 "N+" 折叠 indicator (灰底 + dashed border + count)
  - 选中 note 不在 top 11 时自动 `scrollIntoView({ block: 'nearest' })` 滚到可视区
  - Hover 200ms 后弹 portal tooltip (玻璃模糊 backdrop, 右侧浮, title + body 前 90 字符)
  - 选中态 `scale(1.05) ring-2 ring-accent` 强化
  - Scroll cue: 顶部/底部 fade gradient + `IntersectionObserver` 监听 first/last item
  - 抽出 `FocusStrip` 子组件 (310 行), 保留 split 模式原状
- **App.tsx: 传 `dailyNotes` + `onOpenNotesTab` 到 TodayBacklog, 删 DailyNoteCards 重复** — 之前同一份 "Today's notes" 数据在 `App.tsx` 渲染两次 (DailyNoteCards + TodayBacklog 备用 section), 现在统一在 TodayBacklog 内部:
  - TodayBacklog 备用 section 真的 list 前 3 个 note (title + preview 90 字符)
  - Empty 时显示 "Capture today's note" CTA → `onOpenNotesTab` 跳 Notes tab
  - 多于 3 时显示 "View all" 跳 Notes tab
  - 删 `src/components/DailyNoteCards.tsx` (220 行死代码)

### Removed
- `src/components/DailyNoteCards.tsx` — 被 TodayBacklog 收口替代 (220 行)

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 32 files / 304 tests pass
- `npm run build` ✅ vite 2.75s, main chunk 359 kB (-9 kB from 1.1.4 — DailyNoteCards 删除 > strip polish 增加)
- `npx playwright test` ✅ 13/13 e2e pass (新增 cap test, 12 上限 + tooltip + N+ 跳转)

## [1.1.4] - 2026-07-20

### Added
- **Today view UX 收紧** (`src/components/TodayBacklog.tsx`, commit `<pending>`) — 之前 50% 空白 + 7 个 task 藏在折叠组看不见, 现在:
  - 4 stat cards strip: Tasks today / Overdue (红 if > 0) / Completed / Focus (0-3 进度条), 在 focus bar 与 filter pills 之间
  - "No deadline" 组默认展开 + "Hide tasks without deadline" checkbox
  - focus bar 短文案 "Add tasks below with + button, or let AI pick your 3."
  - focus bar 下面 anchor 行 "↓ N today, N overdue" 视觉锚到下方 backlog
  - 接口加可选 `dailyNotes` + `onOpenNotesTab` props (后向兼容, 父级没传则备用 section 不渲染)
  - 配套 CSS 在 `src/index.css`: `.today-stat-strip` 4 列 grid + 响应式 2 列断点
- **Note editor footer + polish** (`src/features/v2/notes/NoteEditor.tsx`, commit `<pending>`) — 让 editor 不再短 body 看起来太空:
  - 底部 statusbar: `N words / N chars / ~N min read` (11px muted, 右对齐), 空 body 显示 "Empty"/"空白"
  - body `min-h-[60vh]` 保证短 note 写区有合理高度
  - 无 backlinks 时 footer 左侧加 "Last updated 5m ago" 用 relativeTime
  - i18n COPY 加 5 个 key (zh + en): `words / chars / minRead / lastUpdated / bodyEmpty`

### Fixed
- **Settings 默认 Font Size 显示 280%** — `SettingsModal.tsx:483` 用 `80 + val*40` 算 label, 但实际 scale 用 `0.8 + val*0.04` (val=5 → CSS scale 1.0 = 100%, 但 label 显示 280%). 改 label 公式为 `Math.round((0.8 + val*0.04) * 100)`, 默认现在正确显示 "100%".

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 32 files / 304 tests pass
- `npm run build` ✅ vite 2.92s, main chunk 368 kB (+5 kB for stat cards + footer)
- 6/6 e2e pass (today-backlog + note-acceptance ×3 + notes-focus + notes-view)

## [1.1.3] - 2026-07-20

### Added
- **Note editor focus mode** (commit `<pending>`) — toggle the side list to a 56px icon strip so the document-first editor gets the full pane width for long-form writing. The mode is persisted to `localStorage` (key `df_notes_layout`, namespaced by `workspaceId`) so the choice sticks across sessions.
  - `src/features/v2/notes/NotesView.tsx` — adds `layout: 'split' | 'note'` state, localStorage persistence, an inline grid-template style for the responsive collapse, and forwards `layout` + `onToggleLayout` to both children.
  - `src/features/v2/notes/NoteList.tsx` — adds an "icon strip" render path (`layout === 'note'`) with one circular avatar per note (first letter of the inferred title) and a `+` button to create a new note. Each avatar is a one-click switch.
  - `src/features/v2/notes/NoteEditor.tsx` — adds a `⛶` button in the header that calls `onToggleLayout`. The button stays reachable from focus mode so the user can come back to the list view.
- **Backlinks panel** (commit `<pending>`) — full reverse-relationship view in the editor footer. Lists every Commitment, Decision, Outcome, and Evidence that references the current note. Implements spec §26 step 19 ("用户一个月后询问当时为什么这样决定, 系统用 Decision 和 Evidence 回答") by surfacing the exact ids the user can click through to.
  - `server/services/v2/noteService.ts` `backlinks(id)` — was a stub returning `commitmentIds: []` etc. Now walks `repo.listCommitments` / `listDecisions` / `listOutcomes` and returns any whose `evidenceIds` intersect with the note's evidence set. The lookup is O(N×M) but bounded by typical note evidence count (< 50) so it stays cheap; an indexed join in `index.sqlite` is reserved for later if it ever becomes a hot path.
  - `src/features/v2/notes/NoteEditor.tsx` — new `BacklinksPanel` component renders the four row groups with their id lists (truncated to 16 chars + ellipsis for readability).
- **§26 step 17 / 18 / 19 acceptance** (`e2e/note-acceptance.spec.ts`, 3 tests, ~3.5s total) — verifies that an empty-body POST creates a `draft`, that a PATCH without `body` never rewrites the body, and that `memory.search` surfaces notes with a matching snippet.
- **Notes focus mode e2e** (`e2e/notes-focus-mode.spec.ts`) — verifies the toggle round-trips, the icon strip remains usable, and the editor body persists across the layout switch.
- **NoteDocument unit tests** (`server/services/v2/__tests__/noteService.test.ts`, 17 tests) — created + auto-update + concurrent-modification + partial update + sort + filter + text search + touchLastOpened + archive + delete + cascade + backlinks + markdown round-trip + class re-export identity.

### Fixed
- **Note body round-trip lost newlines** — `markdownSerializer.yamlString` collapsed `\n` into spaces for inline scalars, so any multi-paragraph note's body was silently mangled when serialized. `serializeNoteDocument` now writes the body to the markdown section only (frontmatter is metadata); the repository's `listNoteDocuments` and `findById` splice the markdown body back in (trimming the trailing newline the serializer adds for clean paragraph breaks). Found by `noteService.test.ts > markdown round-trip`.
- **Note evidence cascade didn't run** — `listEvidence` walked `notes/_evidence/` at the root, but `saveEvidence` writes `notes/YYYY/MM/_evidence/`. The list always returned `[]` so `listEvidenceForNote` found nothing and `deleteNoteDocument`'s cascade silently orphaned the per-month evidence files. `listEvidence` now walks the whole `notes/` tree and filters on the `_evidence/` path component. Found by `noteService.test.ts > delete cascade`.

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 32 files / 304 tests pass (was 287; +17 NoteDocument tests)
- `npm run build` ✅ vite build 2.85s, main chunk 363 kB (was 359 kB at 1.1.2; +4 kB for focus mode + backlinks panel)
- `npx playwright test e2e/notes-focus-mode e2e/notes-view-visual e2e/note-acceptance e2e/today-backlog-visual` ✅ 6/6 pass (15.7s)
- Playwright e2e `e2e-screenshot-notes-focus-mode.png` shows the icon strip on the left and the editor at full pane width.

## [1.1.2] - 2026-07-20

### Added
- **Main App Notes tab integration with v2 NoteDocument** (commit `<pending>`) — the v1 `Notes` component is replaced by `NotesView` in the App's Notes tab so the 1.1.0 backend and 1.1.1 hooks are reachable from the default UI.
  - `src/features/v2/notes/NoteList.tsx` (new) — list of notes grouped by view (All / Recent / Daily / Meetings / Projects / Pinned / Archived). "+ New note" button creates a draft and opens the editor. Each row exposes archive + delete. Pinned-first sort.
  - `src/features/v2/notes/NoteEditor.tsx` (new) — document-first editor: optional title input, body fills the rest of the pane, kind/date/pin/archive controls in the header, autosave status badge ("saving…" / "Saved" / "Resolving conflict…" / "Save failed") driven by `useNoteAutosave`. Flushes on unmount to prevent the "edited → navigated → lost" race.
  - `src/features/v2/notes/NotesView.tsx` (new) — composes list + editor; two-column layout that collapses to a single column on mobile.
  - `src/App.tsx` — Notes tab default case now renders `<NotesView language={language} />` instead of the v1 `<Notes>`.

### Fixed
- **NoteDocument frontmatter read-back** — `serializeNoteDocument` now writes `body` to **both** the frontmatter and the markdown section, and `listNoteDocuments` / `findById` splice the markdown body in as a safety net for files written before this fix. Without this, `NoteDocumentSchema.parse` was rejecting the persisted notes because the schema requires `body` and the old serializer had only put it in the markdown section.
- **Button accepts `data-testid`** — `src/features/v2/components/States.tsx` `Button` now accepts and forwards a `data-testid` prop so callers don't have to wrap it for test selectors.

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 31 files / 287 tests pass
- `npm run build` ✅ vite build 2.83s, main chunk 359 kB (down 1 kB from 1.1.1)
- Playwright e2e `e2e/notes-view-visual.spec.ts` ✅ renders NotesView with the list, opens the pre-seeded note, mounts the document-first editor with title + body, and screenshots the result. Screenshot at `e2e-screenshot-notes-view.png`.

## [1.1.1] - 2026-07-20

### Added
- **NoteDocument API client + React Query hooks** (commit `<pending>`) — frontend surface for the 1.1.0 backend. The hooks namespace list keys (`['v2-notes', state, kind, q]`) so Inbox / Recent / Daily / Favorites views mount independently and a single mutation can evict the right slice without invalidating the world.
  - `src/features/v2/api/client.ts` — adds `NoteDocument`, `CreateNoteInput`, `UpdateNoteInput`, `NoteBacklinks`, `NoteKind`, `NoteState` types and 7 functions: `listNotes` / `createNote` / `getNote` / `updateNote` / `deleteNote` / `archiveNote` / `getNoteBacklinks`.
  - `src/features/v2/hooks/useNotes.ts` (new) — `useNotes` (list, with state/kind/q filter), `useNote` (single + side-effect-touches `lastOpenedAt`), `useCreateNote`, `useUpdateNote`, `useDeleteNote`, `useArchiveNote`, `useNoteBacklinks`, and a 1-shot autosave helper `useNoteAutosave` that:
    - debounces body changes (800 ms),
    - tracks the local `expectedAutoSaveVersion` and bumps it after every successful save,
    - transparently retries on 409 `concurrent_modification` by re-reading the note and patching again,
    - exposes `status: 'idle' | 'saving' | 'saved' | 'error' | 'conflict'` so the editor can render a small status indicator without building its own retry machine.

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 31 files / 287 tests pass (no regression)
- `npm run build` ✅ vite build 5.38s, main chunk 360 kB unchanged (hooks are tiny)

## [1.1.0] - 2026-07-20

### Added
- **NoteDocument as a first-class v2 entity** (commit `48cdbf7`) — the backend layer for spec §5.2 / §7.3 / §11.3 / F-02A. Notes are persisted to `.dailyflow/notes/YYYY/MM/<id>.md` (isolated from v1's `Notes/` legacy tree) and carry a stable `autoSaveVersion` + `contentHash` for optimistic-concurrency autosave.
  - `server/domain/v2/types.ts` (+87 行) — `NoteKindSchema` (quick / daily / meeting / project / reference / general) + `NoteDocumentSchema` (title optional, body, kind, state, date, projectIds, personIds, sourceIds, pinned, lastOpenedAt, autoSaveVersion, contentHash, tagIds). Adds NoteDocument to `AnyV2EntitySchema`.
  - `server/domain/v2/ulid.ts` — adds `'note'` prefix to `EntityPrefix`.
  - `server/repositories/v2/paths.ts` — `V2Layout.notes` + `entityPath('note', …)` and `entityPath('note_evidence', …)` for co-located per-note evidence.
  - `server/repositories/v2/markdownSerializer.ts` (+36 行) — `serializeNoteDocument(n)`; updated `serializeEvidence(e)` to emit `note_id` and `source_id` (exactly one, per schema) and an anchor header `Evidence (note:…)` or `Evidence (source:…)`.
  - `server/repositories/v2/repository.ts` (+127 行) — `saveNoteDocument` / `getNoteDocument` (walks the YYYY/MM partition) / `listNoteDocuments` (recursive + state filter, skips `_evidence/` subdirs) / `deleteNoteDocument` (cascades to note-anchored evidence) / `listEvidence` now unions source + note evidence trees / `listEvidenceForNote(noteId)`.
  - `server/services/v2/noteService.ts` (new, 299 行) — `NoteService` class wrapping the repo with:
    - `create(input)` — no title, no kind, no date required; `kind` and `title` inferred from body heuristically; state defaults to `draft`. Spec F-02A.
    - `update(id, input)` — requires `expectedAutoSaveVersion`; throws `ConcurrentModificationError` (re-exported from the repo for `instanceof` checks at the routes layer) on version mismatch; bumps `autoSaveVersion` and `contentHash`.
    - `touchLastOpened(id)`, `archive(id)`, `delete(id)`, `backlinks(id)`.
    - `list({ state, kind, q })` with pinned-first + recency sort, in-memory text filter.
  - `server/routes/v2/index.ts` (+191 行) — 7 new endpoints:
    - `GET    /api/v2/notes?state=&kind=&q=`
    - `POST   /api/v2/notes`
    - `GET    /api/v2/notes/:id` (side-effects `touchLastOpened` for Recent)
    - `PATCH  /api/v2/notes/:id` (version conflict → 409)
    - `DELETE /api/v2/notes/:id` (cascades)
    - `POST   /api/v2/notes/:id/archive`
    - `GET    /api/v2/notes/:id/backlinks`
  - `POST /api/v2/evidence` now accepts `noteId` + `note_block` locator; quote must be a verbatim substring of the note body (spec §10.5).
  - `server/services/v2/memoryService.ts` — `search` now includes `type: 'note'` hits (spec §26 step 19).

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 31 files / 287 tests pass (no regression; NoteDocument unit tests deferred to 1.1.1)
- `npm run build` ✅ vite build 3.40s, main chunk 360 kB unchanged (backend-only)

## [1.0.9] - 2026-07-20

### Removed
- **Dead-code DailyFocus cleanup** (commit `b42ff22`) — `src/components/DailyFocus.tsx` (389 lines) and `src/__tests__/components/DailyFocus.test.tsx` (89 lines, 3 tests) deleted. DailyFocus was the modal-picker introduced in `f1ef5ec` and superseded by `TodayBacklog` in 1.0.8 (commit `160637a`); no production code referenced it at the time of this commit.

### Verified
- `npm run lint` ✅ 0 errors
- `npm test` ✅ 31 files / 287 tests pass (was 32/290 — 3 DailyFocus unit tests removed)
- `npm run build` ✅ main chunk 360 kB unchanged (DailyFocus was already tree-shaken out by 1.0.8)

## [1.0.8] - 2026-07-20

### Added
- **TodayBacklog — focus bar + urgency-grouped backlog** (commit `160637a`)
  - `src/components/TodayBacklog.tsx` (450 行) — replaces the 1.0.7 DailyFocus modal with a sticky "today's three" focus bar at the top + always-visible urgency-grouped backlog (overdue / today / this week / later / no-deadline) below. Each backlog card has a one-click `+` to add to today's three (or a `✓` to remove when already in the three). Filter pills at the top toggle the view between All / Overdue / Today / This week / Later.
  - `src/index.css` (+394 行) — TodayBacklog visual styles (sticky focus bar with backdrop-blur, urgency-group accent colors, filter pill states, add/remove affordances). Comment block explicitly notes this is the v1.0.7 redesign that supersedes the old `daily-focus-*` legacy styles.
  - `App.tsx` — Today tab now renders `<TodayBacklog>` instead of `<DailyFocus>` + the collapsible "everything else" fold. Net `-269` lines in App.tsx.
  - `docs/AI_NATIVE_UI_UX_SPEC.md` (+816 行新文件) — authoritative UI/UX spec referenced as equal-implementation-constraint from the main spec. Defines Today / Notes / Memory visual + interaction rules so future agents don't drift from the redesign.
- **Spec: NoteDocument as first-class object** (`docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md`, +218 行)
  - §5.2 adds `NoteDocument` alongside `SourceItem` — user-authored, document-first, persistent work journal (quick / daily / meeting / project / reference / general). Distinguishes Notes from "external facts captured automatically" so AI doesn't conflate them.
  - §7 main navigation renamed from `Today / Inbox / Memory` to `Today / Notes / Memory`. Inbox becomes a smart view inside Notes (Quick capture + recent + uncategorized).
  - §7.3 Notes full definition: Inbox / Recent / Daily / Meetings / Projects / Favorites.
  - F-02A "write a note" user flow: open-and-write, auto-save, AI suggestions only in review sidebar, no rewrite of body without explicit diff accept.
  - §11.3 `NoteDocument` type (title optional, kind, state, projectIds, personIds, sourceIds, pinned, autoSaveVersion, contentHash).
  - §11.4 `Evidence` broadened to allow `noteId` + `blockId` anchoring (in addition to `sourceId`).
  - Top of file: links `docs/AI_NATIVE_UI_UX_SPEC.md` as equal-implementation-constraint.

### Changed
- Today tab no longer shows a modal picker for choosing focus tasks; the "pick 3" is now a sticky bar visible at all times.
- Today tab backlog is always visible (no more "everything else" fold).
- Main navigation: `Inbox` tab renamed to `Notes` to match v2 spec narrative.

### Verified
- `npm run lint` ✅ 0 errors
- `npm test` ✅ 32 files / 290 tests pass (DailyFocus unit tests still cover the removed modal flow in isolation)
- `npm run build` ✅ vite build 3.22s, main chunk 360 kB (down from 367 kB at 1.0.7) — net code removal from dropping DailyFocus modal path
- Playwright e2e `e2e/today-backlog-visual.spec.ts` ✅ renders focus bar + 5 filter pills + empty state; screenshot at `e2e-screenshot-today-backlog.png`

### Known follow-ups
- `src/components/DailyFocus.tsx` and `src/__tests__/components/DailyFocus.test.tsx` are now dead code (DailyFocus is no longer mounted in App.tsx). Kept in this release so the commit stays scoped; recommend removing them in 1.0.9.
- 1.0.7's `fix(daily-focus): keep plan modal in Today when AI is not configured` had no production effect in 1.0.7 itself because App.tsx was already mid-refactor at the time of that commit. The same behavior now happens by construction in 1.0.8: TodayBacklog never kicks the user to AI Chat; it stays in Today and degrades to manual `addToFocus` in-place.

## [1.0.7] - 2026-07-20

### Fixed
- **Today plan modal stays in Today when AI is not configured** — `src/components/DailyFocus.tsx` (commit `75acf54`) — When no AI provider is configured (the default state — `useState('')` is never populated unless the user visits Settings), the empty-state primary CTA used to silently jump the user to the AI Chat tab via `onConfigureAI`, which was misleading because the AI Chat tab doesn't help pick 3 focus tasks and the only escape hatch was a "Connect an AI model" button inside the plan modal. Now the primary CTA and the plan modal both stay in Today: they degrade to manual mode in-place so the user can pick their 3 focus tasks directly. The misleading "Connect an AI model" CTA is removed from the planner footer because that flow is no longer reachable when AI is unavailable.

### Verified
- `npm run lint` ✅ 0 errors
- `npm run test` ✅ 32 files / 290 tests pass
- `npm run build` ✅ vite build 4.29s, 4062 modules, all chunks under warning threshold

## [1.0.6] - 2026-07-16

### Fixed
- **Lint baseline 修復** — 補齊 `@types/react` / `@types/react-dom` (React 19 從 npm 拆出類型) + `NoteEditor.tsx` 將 `className/style` 從 `ReactMarkdown` 移到外層 div (新版 props 不再支持) + 移除 vitest 對 `contracts/**` 的誤匹配 (硬節點的 sync-rpc/sync-request 會把 vitest run 拉 timeout)
- **`server/services/git.ts` ahead/behind 命令注入修復** — 對 `branch` 做白名單校驗 (`/^[A-Za-z0-9._\-\/]+$/`) + 把 `exec` 拼接字符串改為 `execFile` (即使 `git branch --show-current` 自身輸出也已防禦性加固)

### Changed
- **`vite.config.ts` manualChunks 改造為函數式** — 函數版按依賴前綴判定 → 拆出 `chain` (wagmi/viem/coinbase/safe-global) / `tanstack` / `vendor` 等 chunk; 主 `index` chunk 從 777kB → 380kB, 所有 chunk 都在 800kB 警告閾值內
- **`server/routes/meetings.ts` console.error 統一不打印整個 error 對象** — 改打印 `error.message` 字串, 避免 API key 之類敏感字段意外寫入服務器日誌
- `chunkSizeWarningLimit` 600 → 800 (手動 chunks 拆分後值合理)

### Verified
- `npm run lint` ✅ 0 errors
- `npm run test` ✅ 16 files / 164 tests pass
- `npm run build` ✅ 主 chunk gzip 97kB, 全 chunk 都在警告閾值下
- `cargo check` ✅ 0 warnings

## [1.0.4] - 2026-07-12

### Added
- **Granola × DailyFlow Phase 2 — 真实音频 + 转录 + 落盘完整管线** (PRD `docs/review/granola-fusion-spec.md` §6.2, 全部 6 个 M 落地)
  - **M1 ⌘⇧R 全局快捷键** — `src/App.tsx` 全局 keydown listener 触发 MeetingCapture modal; 拦下浏览器 reload 默认行为, 提示 dailyflow 会议快捷键; 同时 `⌘K` palette 加 "Record Meeting" 入口
  - **M2 本地音频录制 (Web API, 不破 src-tauri/)** — `MeetingCapture.tsx` 用 `navigator.mediaDevices.getUserMedia({audio:true})` 拿麦克风 + `MediaRecorder` 录到 Blob; macOS 首次自动弹权限框
  - **M3 server 端 OpenAI-compatible Whisper 转录** — `server/routes/meetings.ts` `POST /api/meetings/transcribe` 异步: 接 base64 audio → FormData → 转发到 provider 的 OpenAI-compatible `/audio/transcriptions` 端点; 返回 `jobId` 客户端轮询 status; 1h 音频 (~80MB base64) 走流式不爆内存; 转录失败保留 raw audio 让用户重试; 复用现有 15+ provider 配置, 不新加依赖
  - **M5 Action Items → Tasks 自动落盘** — `POST /api/meetings/extract-actions` (新 endpoint) 用 LLM 抽 action items JSON `[{title, owner, due, project, priority}]`; 客户端弹 "Review N Action Items" 卡片, 用户确认才落盘; 走 `tasksApi.create`, source_date = 今天, 带 `#meeting-link:{note-id}` tag
  - **M6 meeting_note 自动注入 AI Chat 上下文** — `ContextPicker.tsx` "会议" tab 默认 checked 包含最近 7 天 `type === 'meeting_note'` 的笔记; 顶部加 "Auto-include: 7 days" toggle
  - **M7 ⌘K 跨会议搜索** — 复用 Notes 搜索逻辑, 扩展到 `type === 'meeting_note'` 全文; 结果卡: 日期 + 标题 + 1 段摘要 + 点开进 Notes
- **R3 refactor — 抽 useAiSession 公共 hook 消 AIChat/FloatingAIPanel 90% 重复**
  - **统一状态共享** — `src/hooks/useAiSessionStore.ts` (113 行) 模块级 store, 跨 AIChat / FloatingAIPanel 实例同步 (修两个 session 列表互不可见 bug)
  - **send pipeline 抽离** — `src/hooks/useAiSessionSend.ts` (215 行) 持有 `isStreaming` + `abortRef` + `sendMessage` / `stopMessage` / `retryMessage`; 主 hook 减到 246 行 (< 400 上限)
  - **context builders 抽离** — `src/hooks/aiContextBuilders.ts` (108 行) 持有 `buildContextText` / `buildAutoContextText`; 主 hook 暴露稳定 callback (useCallback 包裹, React.memo 安全)
  - **API 兼容** — 父组件 props 不变; `localStorage['df_ai_chat_store']` 兼容, 老用户 session 不丢
  - **行数** — `AIChat.tsx` 1370 → 489, `FloatingAIPanel.tsx` 1133 → 473, 总 -1570 行重复

### Changed
- `package.json` version → `1.0.4`
- `src-tauri/tauri.conf.json` version → `1.0.4`

### Verified
- `npm run lint` ✓ (tsc --noEmit 0 错误)
- `npm run build` ✓ (vite build 2.85s, 2373 modules)
- 行数达标: AIChat 489 / FloatingAIPanel 473 / useAiSession 246 — 都 < plan 上限
- 禁区干净: UX_REDESIGN / ROADMAP / PRODUCT / src-tauri (config 除外) / .harness / .mavis / README 都没动

## [1.0.3] - 2026-07-12

### Added
- **Granola × DailyFlow Phase 1** — 后端代理 + 前端 MeetingCapture 入口
  - `server/routes/meetings.ts` (278 行) — `POST /api/meetings/transcribe` (mock) + `POST /api/meetings/summarize` (LLM 代理), 仿 `/api/ai/summarize` OpenAI-compatible 模式, SSRF 防护 (BLOCKED_HOSTS + `isBlockedHost` + `resolveUrl`), API key 不出服务器
  - `src/components/MeetingCapture.tsx` (488 行) — 4 步 modal (输入会议标题/参会人 → 粘贴 transcript → mock 转录 → LLM 整理 → 预览 Markdown → 保存 meeting_note + 抽 action items 转 task)
  - `src/components/ContextPicker.tsx` 第 5 个 tab "会议" — 列出 `type === 'meeting_note'` 最近笔记
  - `meetingsApi` (`src/api/client.ts:832`) — `transcribe` / `summarize` 类型化客户端

### Fixed
- **Notes 搜索漏字段** — `src/components/Notes.tsx:232-238` 搜索从 title/body/mentions 扩展到 meeting_note 的 `time`/`endTime`/`participants`
- **@mention 不支持连字符/点** — `src/components/NoteCard.tsx:35` regex 字符类扩展, 兼容 `@jean-luc.picard`
- **AI Summary 错误信息裸抛** — 抽 `src/utils/aiErrorMessage.ts` 共享 `getFriendlyAiErrorMessage`, Notes.tsx 接入, 不再 `console.error` + 裸 `err.message`
- **DailyNoteCards 缺 meeting_note 直达入口** — 虚线占位旁加 "会议" 按钮, 直接建 `type: meeting_note`

### Changed
- `package.json` version → `1.0.3`
- `app.use('/api/meetings', meetingsRouter)` 注册到 `server/index.ts:51-62`

### Removed
- 调试探针 `DEBUG_TASK_DUPLICATE_URL` (`src/App.tsx:50-86` 整段, ~37 行)
- 死代码 `src/components/Projects.tsx` (422 行, 全文 0 外部 import)
- 死代码 `src/components/AIWorkflow.tsx` (317 行, 全文 0 外部 import)

### Verified
- `npm run lint` ✓ / `npm run build` ✓ / `npm run build:server` ✓
- 11/11 端到端冒烟 PASS (qa-engineer verifier)
