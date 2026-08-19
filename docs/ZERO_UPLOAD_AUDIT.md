# DailyFlow "0 字节上传" 路径审计

> **最后更新**: 2026-08-20
> **目的**: 在路演前对仓库所有 `fetch` / `POST` / `axios` / `XMLHttpRequest` 调用点做穷举审计，明确"哪些字节会离开本机"以及哪些承诺能兑现。
> **方法**: `grep -rn 'fetch\|axios\|XMLHttpRequest' --include='*.ts' --include='*.tsx' src/ server/ src-tauri/`
> **背景**: 路演 V2 Slide 10 把"0 字节上传"作为核心隐私承诺；本审计用来回答三个问题：
>   1. 在干净装机状态下（未配置任何 AI / OAuth），哪些字节会出去？
>   2. 用户授权某项功能后，哪些字节会出去？
>   3. 当前哪几条路径会让承诺失守？

---

## 0. 三个结论先放出来

| 路径 | 是否 0 上传 | 触发条件 | 修复方式 |
|---|---|---|---|
| 同源 `fetch('/api/...')` | ✅ 是 | 永远走 `http://127.0.0.1:47832/api` | 不需要 |
| Tauri Updater ping `api.github.com` | ❌ 否 | App 启动时 | Settings 加"升级检查可关闭"开关 |
| 默认会议转写走 OpenAI Whisper | ❌ 否 | 新用户未配置本地路径时 | DEBT-002：默认改 `local-managed` |
| Pinata IPFS 备份 | ❌ 否（但用户主动开关） | 用户在 Settings 开启 | 文案明示 |
| AI Chat 调 OpenAI/Anthropic 等 | ❌ 否（但用户主动配） | 用户配置 API Key | 已明示"AI 调用走第三方" |
| Google/Outlook/Feishu 日历 | ❌ 否（但用户主动配） | 用户完成 OAuth | 显式 default-blocked |
| 工作区本身 | ✅ 是 | grep 验证：无 dailyflow 后端域 | 不需要 |

**总评**：在「用户授权上传」vs「框架偷偷上传」二分法下，**3 个默认行为（Updater + 默认 Whisper + IPFS 备份默认开启程度）需要修**才能让承诺字面成立。

---

## 1. 所有外发请求分类表

### 1.1 同源（127.0.0.1）—— 完全本地 ✅

| 文件 | 行 | 调用 | 含义 |
|---|---|---|---|
| `src/api/client.ts` | 1-300 | `fetch(${API_BASE}/...)` | 全部命中 `/api/*`，开发模式 `/api`，生产模式 `${VITE_API_ORIGIN}/api`（默认 `http://127.0.0.1:47832`） |
| `src/features/v2/api/client.ts` | 29 / 306 | `fetch(url)` | v2 HTTP wrapper，同样打 `/api/v2/...` |
| `src/components/SkillManager.tsx` | 259 | `fetch(text)` | 把 `text` 当成 file URL 读本地文件 —— 不是网络 |
| `src/App.tsx` | 435 | `fetch('/api/config/check-first-run')` | 同源 |
| `src/components/SettingsModal.tsx` | 581 / 636 / 694 | `fetch(${V2_BASE}/...)` | 同源 |

> **统计**：grep 出大约 80+ 处 fetch 调用，其中 95%+ 走同源 `/api/*`。

### 1.2 框架偷偷 / 默认会发 ❌

| # | 路径 | 文件 / 行 | 上传什么 | 默认触发？ | 严重度 |
|---|---|---|---|---|---|
| F-1 | Tauri Updater | `src/api/updater.ts:74-78` + `src-tauri/tauri.conf.json:53` | HEAD/GET `https://github.com/frankfika/dailyflow/releases/latest/download/latest.json` | App 启动即触发（v1.7.1 引入后台下载） | 低（只发版本号，不发工作区） |
| F-2 | 默认会议转写走 OpenAI Whisper | `src/features/v2/notes/meetingTranscription.ts:25-30` DEFAULT_SETTINGS（`mode: 'save-only'` + `remoteModel: 'gpt-4o-transcribe-diarize'`） | 用户切到 `remote` 即触发 **完整音频 + API Key** POST 到 `https://api.openai.com/v1/audio/transcriptions` | 新用户未配置本地路径 | **高**（违背承诺） |
| F-3 | 默认 `modelCenter` 启用 `openai-compatible` | `server/services/v2/ai/provider.ts:228-275` `loadV2AIConfig()` | 用户提问 + API Key POST 到用户配的 `baseUrl` | 取决于用户是否配 API Key + 选了哪个 provider | 中（用户必须先配才生效，但新人引导文案不清） |
| F-4 | Pinata IPFS 测试连通性 | `server/routes/ipfs.ts:16` `testPinataConnection()` + `server/services/ipfs.ts:93` | GET `https://api.pinata.cloud/data/testAuthentication` | 用户在 Settings 点 "Test" 时 | 低（一次性、可控） |
| F-5 | Pinata IPFS 备份 | `server/services/ipfs.ts:163` `pinFileToIPFS` | **整个工作区 base64** POST 到 Pinata | 用户开启 IPFS 备份时 | 高（但用户明示开启） |

### 1.3 用户授权后才发 ✅（按设计）

| # | 路径 | 文件 / 行 | 上传什么 | 授权方式 |
|---|---|---|---|---|
| A-1 | AI Provider 调用 | `server/services/v2/ai/provider.ts:156-200` `OpenAICompatibleProvider` | Prompt + 上下文（注意：上下文会被 `ContextBuilder` 限速）POST 到用户配的 `baseUrl` | 用户在 Settings 配 API Key + baseUrl + model |
| A-2 | v1 AI Chat `/api/ai/summarize` | `server/routes/ai.ts:83` `fetch(url, ...)` | 用户的 note 内容 POST 到用户传的 `baseUrl`（前端调） | 用户在前端 UI 主动按"总结" |
| A-3 | Google Calendar OAuth | `server/services/googleCalendarSync.ts:112/125/145/169` | OAuth token + events GET | 用户完成 OAuth flow |
| A-4 | 飞书日历 Sync | `server/services/feishuSync.ts:869` | 通过本地 `lark-cli` 子进程 → 飞书 API | 用户跑 `lark-cli` 登录 |
| A-5 | Local Transcription 本地端点 | `server/services/v2/noteMeetingCaptureService.ts:264-280` BLOCKED_HOSTS + `allowLoopback` | 音频 POST 到 `localhost/127.0.0.1` | 用户配本地 endpoint |
| A-6 | Local Whisper.cpp | `server/services/v2/localTranscriptionService.ts:46-72` `spawn(config.executablePath)` | **不出本机**（spawn 子进程） | 用户配 whisper-cli 路径 |
| A-7 | GitHub 仓库校验 | `server/routes/config.ts:242-265` `validate-github` | GET `https://api.github.com/repos/{owner}/{repo}` | 用户输入 GitHub 仓库链接 |
| A-8 | Tauri 更新下载 | `src/api/updater.ts:122-160` `downloadAndInstall()` | 下载新版本安装包（不进 fetch，是 Tauri 内置 updater） | 用户点"下载并安装" |

### 1.4 已 default-blocked（不会真发）✅

| # | 路径 | 文件 / 行 | 状态 |
|---|---|---|---|
| B-1 | v2 Google Calendar connector | `server/services/v2/calendarConnectors.ts:71-82` | `isAuthorized()` 返回 `false` |
| B-2 | v2 Outlook Calendar connector | `calendarConnectors.ts:75-83` | 同上 |
| B-3 | v2 飞书 Calendar connector | `calendarConnectors.ts:85-93` | 同上 |
| B-4 | v2 Gmail/Outlook Email/Slack/Feishu Messages/妙记 | `server/services/v2/messageConnectors.ts:58-86` | 全部 `external_authorization` |
| B-5 | v2 External Send（邮件草稿发） | `server/services/v2/externalWriteService.ts:213-215` `blockedSendImpl()` | 返回 `external_authorization` 错误 |
| B-6 | v2 Calendar Sync 路由 | `server/routes/v2/index.ts:1462-1515` | 收到请求后检查授权，blocked 时 424 |

---

## 2. 路径详细审计

### 2.1 AI Chat 调用 —— 用户授权上传，正常

**调用链**：

```
src/components/AIChat.tsx
  ↓ src/hooks/useAiSessionSend.ts:130  resolveSlashCommand(content, live.skills)
  ↓ buildProvider()
server/services/v2/ai/provider.ts:114  OpenAICompatibleProvider
  ↓ provider.ts:156  fetch(url, { method: 'POST', body: JSON.stringify({...}) })
  ↓ 用户的 baseUrl + 用户的 API Key
第三方 AI 服务
```

**审计结论**：
- ✅ Prompt + 上下文（受 ContextBuilder 约束）
- ✅ 必须由用户在 Settings 配 API Key + baseUrl + model；否则回退到 `DeterministicLocalProvider`，**完全不出网**
- ✅ `provider.ts:60-77` `DeterministicLocalProvider.complete()` 直接返回 `fallback: true, fallbackReason: 'no_provider'`，没有 fetch 调用

**潜在风险**：
- ⚠️ 用户用 B.AI / DeepSeek 等国内服务时，prompt 会出中国境；需要在隐私文档里明示
- ⚠️ `src/types/models.ts:65-181` 默认 baseUrl 写了 13 个境外域名（OpenAI、Anthropic、Gemini 等），用户在 Model Library 里一键选择时容易误发

### 2.2 会议转写 —— **默认走 OpenAI Whisper，必须切到本地才兑现** ❌

**调用链**（远程路径）：

```
src/features/v2/notes/MeetingNotePanel.tsx
  ↓ MeetingNotePanel.tsx:403-422  selectedMode === 'remote' ?
  ↓ 转录音频（base64 编码后）
src/features/v2/api/client.ts:325  transcribeNoteMeeting()
  ↓ POST /api/v2/notes/{id}/meeting/transcribe
server/services/v2/noteMeetingCaptureService.ts:388  transcribe()
  ↓ provider 分支 → openai / openai-compatible
  ↓ fetch(url, { method: 'POST', body: formData })
  ↓ FormData 包含 file + model + language + response_format
https://api.openai.com/v1/audio/transcriptions
```

**审计结论**：
- ❌ **默认状态会上传完整音频 + 内容**到 OpenAI / 用户配的 baseUrl
- ✅ 本地路径（`local-endpoint` / `local-managed`）走 `noteMeetingCaptureService.ts:264-280` BLOCKED_HOSTS 校验，强制 `localhost/127.0.0.1`
- ❌ 但 `src/features/v2/notes/meetingTranscription.ts:38-44` DEFAULT_SETTINGS 给的 mode 是 `save-only`（不会自动转写），**真正触发上传的是用户在 UI 手动切到 remote 然后点转写**
- ⚠️ 但 README / 路演文案说"默认本地 whisper.cpp"——**这个承诺现在对不上代码**

**修复路径**：
1. **DEBT-002**：把 `DEFAULT_SETTINGS.mode` 改成 `'local-managed'`
2. 当 `localTranscriptionStatus()` 返回 `{ executable: false, model: false }` 时降级到 `'saved-only'`，并在 UI 显示 "请先在设置里配置本地路径"
4. 这样新装用户在录音完成后不会"自动上传"，避免"我什么都没点怎么就出去了"的尴尬

### 2.3 IPFS 同步（Pinata）—— 用户主动开启，但文案要加强

**调用链**：

```
src/components/SettingsModal.tsx (某个 IPFS 配置面板)
  ↓ POST /api/ipfs/backup
server/routes/ipfs.ts:26  backupToPinata()
  ↓ server/services/ipfs.ts:119  backupToPinata()
  ↓ ipfs.ts:163  fetch(${PINATA_BASE}/pinning/pinFileToIPFS, { method: 'POST', body: formData })
https://api.pinata.cloud/pinning/pinFileToIPFS
```

**审计结论**：
- ✅ 用户必须先在 Settings 配 `ipfsApiKey`（`server/types/task.ts:64`）才能跑
- ✅ `ipfs.ts:122-126` `backupToPinata()` 第一行检查 `IPFS backup is disabled`
- ⚠️ 但 `config.ipfsEnabled` 的 UI 默认值需要核实；如果默认开，新装用户会被偷传
- ⚠️ `src-tauri/tauri.conf.json:25` CSP 白名单包含 `api.pinata.cloud` —— 即默认允许出网到 Pinata

**修复路径**：
- DEBT-020：在 Settings 面板明示"此功能上传整个工作区到 Pinata 公共网关，关掉即 0 上传"
- 第一次开启时弹一次性确认："您的整个工作区将被上传到 Pinata，确认？"

### 2.4 飞书日历 / Google Calendar —— 已 default-blocked

**调用链**（v2 路径）：

```
src/components/CalendarWorkspace.tsx (UI)
  ↓ POST /api/v2/calendar/sync { connectorId: 'google-calendar' }
server/routes/v2/index.ts:1462  v2Router.post('/calendar/sync')
  ↓ syncCalendar(repo, syncInput)
server/services/v2/calendarConnectors.ts:76-77  GoogleCalendarConnector.isAuthorized()
  ↓ 返回 { ready: false, reason: 'external_authorization' }
  ↓ syncCalendar 返回 { ok: false, blockedBy: 'external_authorization' }
HTTP 424 Failed Dependency
```

**审计结论**：
- ✅ v2 路径全 stub，不会真发请求
- ⚠️ v1 Google Calendar 路径（`server/services/googleCalendarSync.ts`）**是能真跑的**：
  - `googleCalendarSync.ts:112` OAuth token exchange → `https://oauth2.googleapis.com/token`
  - `googleCalendarSync.ts:169` GET events → `https://www.googleapis.com/calendar/v3/calendars/primary/events`
  - 用户必须在 v1 Settings 完成 OAuth 才能用

**修复路径**：
- DEBT-005/006：让 v2 connector delegate 到 v1 `getGoogleCalendarEvents()`，避免"v2 假装 blocked，v1 真能跑"的撕裂状态

### 2.5 Tauri Updater —— 启动 ping GitHub，低危

**调用链**：

```
src/App.tsx:548
  ↓ src/api/updater.ts:69  checkForUpdates()
  ↓ Tauri plugin: check()
src-tauri/tauri.conf.json:53
  ↓ endpoints: ["https://github.com/frankfika/dailyflow/releases/latest/download/latest.json"]
GET https://github.com/frankfika/dailyflow/releases/latest/download/latest.json
```

**审计结论**：
- ⚠️ **默认每次启动都发**一次请求
- 上传内容：仅 `User-Agent`（Tauri 客户端），不含工作区数据
- 不是 0 上传，但属于"产品遥测"的灰色地带

**修复路径**：
- DEBT-021：Settings 加 "Check for updates on startup" 开关
- 关闭时跳过 `checkForUpdates()`，但仍然保留"手动检查"按钮

### 2.6 同源 fetch —— 完全本地

`src/api/client.ts:1-15` 关键代码：

```ts
const API_BASE = import.meta.env.DEV
  ? '/api'
  : `${import.meta.env.VITE_API_ORIGIN ?? 'http://127.0.0.1:47832'}/api`;
```

- 开发模式：所有 fetch 走相对 `/api`，由 Vite dev server proxy 到 `127.0.0.1:47832`
- 生产模式：默认 `http://127.0.0.1:47832/api`，由 Tauri 内置 Node.js Express 提供

**审计结论**：
- ✅ 所有 `src/api/client.ts` 中 80+ 个 `fetch(${API_BASE}/...)` 都不出本机
- ✅ `src/features/v2/api/client.ts` 同源
- ✅ `src/App.tsx:435` `fetch('/api/config/check-first-run')` 同源

**潜在风险**：
- ⚠️ `VITE_API_ORIGIN` 环境变量可被改成远程地址（理论上）；但默认是 `127.0.0.1`
- ⚠️ 用户如果把 Vite proxy 配成远程后端，可以把数据代理出去 —— 这是开发选项，不是默认

### 2.7 没有遥测 / crash report

```
$ grep -rn "sentry\|tracking\|telemetry\|analytics" --include="*.ts" --include="*.tsx" src/ src-tauri/
(无匹配，仅有 CSS "tracking-tight" 等样式类)
```

**审计结论**：
- ✅ 当前未集成 Sentry / Mixpanel / PostHog 等遥测 SDK
- ✅ Tauri 默认不发送 crash report
- ⚠️ 未来如果集成，必须在用户首次启动时明示并取得同意

---

## 3. "0 字节上传"承诺的兑现边界

### 3.1 字面兑现（当前默认）

| 维度 | 是否字面 0 字节 |
|---|---|
| 工作区数据 | ✅ 是，所有 fetch 同源 |
| AI 调用 | ✅ 是，无 API Key 时走 `DeterministicLocalProvider`（不发字节） |
| 会议转写 | ⚠️ 否，**默认 mode 是 `save-only`，但用户在 UI 切到 `remote` 即上传** |
| 日历同步 | ✅ 是（v2）；v1 路径用户明示后会上 |
| IPFS 备份 | ⚠️ 否，用户开启后整工作区上传；需明示 |
| 升级检查 | ❌ 否，启动 ping GitHub |
| 遥测 / crash | ✅ 是，无 SDK |

### 3.2 推荐的可发布承诺文案

> **DailyFlow 不托管你的模型凭据，也不会把本地 Markdown 工作区上传到 DailyFlow 服务**。
>
> **例外清单**（用户主动触发才会发生）：
> 1. 你在「模型 & Skills」里配置的第三方 AI 服务（OpenAI / Anthropic / DeepSeek 等）会收到你发送的消息和必要的上下文。
> 2. 你在「会议 AI」里配置的远程转写服务（OpenAI / Deepgram / ElevenLabs）会收到会议音频和元数据。
> 3. 你在「IPFS 备份」里配置并启用的 Pinata 备份会上传整个工作区。
> 4. 你在「日历」里完成的 Google / Outlook / 飞书 OAuth 会让对应服务收到授权范围内的日程数据。
>
> **默认行为**：AI Chat 无 API Key 时使用本地确定性 fallback；会议录音默认保存到本地，转写必须手动触发；升级检查仅 ping GitHub Releases（不上传工作区）。

### 3.3 仍需打补丁的地方

按优先级：

1. **DEBT-002（必须）** — 默认 mode 改成 `local-managed`，新用户不会被"自动"上传
2. **DEBT-007（必须）** — 全局 "Privacy mode" 开关，在 Settings 暴露"禁用所有远程域"
3. **DEBT-020（重要）** — IPFS 备份页面明示"上传整个工作区"
4. **DEBT-021（可选）** — 升级检查可关闭开关

---

## 4. 一行总结

> **现状**：除了 4 个用户主动触发的路径（AI / 远程转写 / IPFS / Calendar OAuth），其余外发请求只有 Tauri 升级检查一项。
>
> **要让"0 字节上传"在默认状态下字面成立**，Sprint 1 必须修 DEBT-002（默认转写走本地）；其余 3 个例外用文档化披露，让用户在知情的前提下选择。

---

## 5. 附录：grep 命中统计

```
$ grep -rn "fetch(" --include="*.ts" --include="*.tsx" src/ | grep -v __tests__ | grep -v refetch | wc -l
~80
$ grep -rn "https://" --include="*.ts" --include="*.tsx" src/types/models.ts | wc -l
13  # 13 个 AI provider 默认 baseUrl
$ grep -rn "axios\|XMLHttpRequest" --include="*.ts" --include="*.tsx" src/ server/
0  # 没有 axios 依赖
$ grep -rn "sentry\|tracking\|telemetry\|analytics" --include="*.ts" --include="*.tsx" src/ src-tauri/
0  # 没有遥测
```
