# DailyFlow Mail Workspace 版本规划

> 文档版本：0.1
> 状态：候选方案，尚未进入实现
> 候选版本：DailyFlow v1.2 / Mail Workspace
> 最后更新：2026-07-28
> 适用范围：桌面端、Gmail 首发、本地优先
> 上位规范：[`AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md`](./AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md)

---

## 0. 文档目的

本文档记录 DailyFlow 邮件工作台的产品边界、开源复用策略、技术架构、实施顺序和发布门槛，方便后续开发者或 AI Agent 直接继续推进。

本文档是邮件专项规划，不替代 AI-Native 产品总规格。发生冲突时按以下顺序处理：

1. 用户在当前任务中的明确要求。
2. `AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md`。
3. 本文档。
4. 当前代码和测试。
5. 其他历史路线图与说明文档。

---

## 1. 产品结论

### 1.1 一句话定义

**Mail Workspace 是 DailyFlow 的邮件行动工作台：用户可以在一个安全、可日常使用的轻量邮件客户端中阅读、处理和回复邮件，并把邮件中的承诺、等待项、附件和截止时间接入 DailyFlow 的工作闭环。**

### 1.2 为什么要做

任务说明“我要做什么”，日历说明“什么时候做”，邮件则承载了大量真实工作输入：

- 别人向用户提出的请求。
- 用户对外作出的承诺。
- 等待对方回复的事项。
- 合同、报价、方案等关键附件。
- 会议安排、截止日期和项目变更。

邮件进入 DailyFlow 后，产品才能更完整地回答：

- 今天有哪些邮件必须处理？
- 我答应了谁什么？
- 哪些事情正在等别人？
- 哪个附件属于哪个项目？
- 哪封邮件应该进入“今日三件事”？

### 1.3 产品边界

首发目标是“足够日常使用的办公邮件客户端”，不是复制 Gmail、Outlook 或 Thunderbird 的全部功能。

必须保留 DailyFlow 的核心差异：

- 首页关注“需要行动的邮件”，不是制造未读数焦虑。
- 邮件可以转为 SourceItem、Commitment、Task、Note 或 Project Evidence；等待回复使用 Commitment 的 `waiting` 状态。
- AI 负责提取、建议和起草，不得未经确认发送。
- 邮件、附件和凭据默认本地处理，并让同步范围和权限保持可见。

---

## 2. 已确认的首发需求

### 2.1 邮件阅读

- Gmail 账号连接与断开。
- 收件箱、已发送、草稿、星标和自定义标签。
- 邮件列表、分页或增量加载。
- 会话串视图。
- 完整 HTML 与纯文本正文。
- 发件人、收件人、抄送、时间和邮件头基本信息。
- 已读、未读、星标、归档。
- 按关键词、联系人和标签筛选。

### 2.2 附件

- 展示附件名称、类型、大小和下载状态。
- 图片应用内预览。
- PDF 应用内预览、翻页和缩放。
- 文本、Markdown 和常见代码文件只读查看。
- Word、Excel、PPT、压缩包等下载后调用系统默认应用。
- 单个下载、全部下载。
- 保存到 DailyFlow 工作区或指定项目。
- 保存后建立邮件、附件、项目和 SourceItem 的可追溯关系。

### 2.3 撰写与回复

- 新建邮件。
- 回复、回复全部、转发。
- To、Cc、Bcc。
- 基础富文本编辑。
- 添加和移除附件。
- 草稿自动保存。
- 发送前最终预览。
- 发送成功、失败和重试状态明确。
- 防止网络重试导致重复发送。

### 2.4 标签

- 读取并展示 Gmail 系统标签和用户标签。
- 新建、修改和移除用户标签。
- 对邮件或会话添加、移除标签。
- 标签状态与 Gmail 双向同步。
- DailyFlow 内部的项目、人员和行动状态不得直接伪装成 Gmail 标签；两套模型通过映射关联。

### 2.5 自定义回复

“自定义回复”包含三层：

1. **签名**：按账号选择默认签名。
2. **回复模板**：保存常用回复，可插入变量。
3. **AI 回复偏好**：按账号、联系人、组织或场景设置语气、长度、语言和禁用表达。

示例：

> 回复这个客户，语气专业但不要太正式；说明延期两天，给出新的交付时间；引用报价附件；最后使用商务签名。

AI 生成的内容必须进入普通编辑器，并由用户确认后发送。

### 2.6 DailyFlow 联动

- 邮件转为 SourceItem。
- 从邮件提取候选 Commitment、Task、Decision、Person 和截止日期。
- 一键“加入今日候选”，但不静默占用今日三件事。
- 一键“等待对方回复”，并设置复查时间。
- 保存附件到项目并作为 Evidence。
- 从 Commitment 打开原始邮件会话。
- 发送回复后记录 Outcome，但不自动把承诺标记完成。

---

## 3. 首发不做

- Outlook 和通用 IMAP/SMTP 同时首发。
- Exchange 专有能力。
- 邮件规则引擎的完整复刻。
- 垃圾邮件分类器。
- S/MIME、PGP 和端到端加密。
- 共享邮箱、代理发送和企业权限矩阵。
- 邮件营销、群发、打开率和链接追踪。
- 延时发送和撤回发送。
- 完整联系人管理系统。
- 自动发送 AI 回复。
- 在应用内编辑 Word、Excel、PPT。
- 把全部历史邮箱一次性下载到本地。

这些能力以后按真实使用反馈进入 P1/P2，不提前扩张首发范围。

---

## 4. 开源复用方案

调研日期：2026-07-28。正式引入依赖前必须再次核对仓库状态、具体版本和许可证文件。

### 4.1 首选参考与移植来源：Zero Email

- 仓库：[Mail-0/Zero](https://github.com/Mail-0/Zero)
- 许可证：MIT
- 技术栈：React、TypeScript、Tailwind、Node.js、Drizzle、PostgreSQL
- 可重点复用或改造：
  - 邮件三栏布局和会话详情。
  - Gmail OAuth 与 Gmail API 接入思路。
  - 邮件列表、正文、标签和撰写器组件。
  - 附件处理与 AI 邮件交互。

不建议直接 fork 整个项目作为 DailyFlow 新底座。Zero 使用 Next.js、Bun 和 PostgreSQL，而 DailyFlow 使用 React、Vite、Tauri、Express 和本地工作区。正确方式是按模块移植，并用 DailyFlow 的 Provider、API、存储与设计系统重写边界。

### 4.2 可借鉴但不直接复制

#### Inbox Zero

- 仓库：[elie222/inbox-zero](https://github.com/elie222/inbox-zero)
- 适合借鉴：AI Rules、预生成回复、待回复、等待对方回复、附件归档和会议简报。
- 限制：采用 AGPLv3 并带附加商业限制。未经进一步许可证审查，不直接复制代码或形成衍生实现。

#### Mailspring

- 仓库：[Foundry376/Mailspring](https://github.com/Foundry376/Mailspring)
- 适合借鉴：成熟客户端交互、会话、模板、离线同步和异常状态。
- 限制：Electron + C++ 同步引擎，且为 GPLv3，不适合直接嵌入当前 DailyFlow。

#### EmailEngine

- 仓库：[postalsys/emailengine](https://github.com/postalsys/emailengine)
- 优点：统一 IMAP、SMTP、Gmail API 和 Microsoft Graph。
- 限制：Source Available 商业许可，试用后需付费；依赖服务端和 Redis，不符合当前轻量本地优先目标。
- 结论：可用于快速原型或未来商业方案评估，不作为默认底座。

### 4.3 推荐的独立组件

| 能力 | 候选组件 | 许可证/备注 |
|---|---|---|
| Gmail 首发 | Google Gmail API 官方 SDK/REST | 以官方 API 为准 |
| 通用 IMAP | [ImapFlow](https://github.com/postalsys/imapflow) | MIT，放到后续版本 |
| MIME 与附件解析 | [MailParser](https://github.com/nodemailer/mailparser) | MIT |
| SMTP 发送 | [Nodemailer](https://github.com/nodemailer/nodemailer) | MIT，放到通用邮箱阶段 |
| 富文本编辑 | [Tiptap](https://github.com/ueberdosis/tiptap) 核心能力 | MIT，扩展逐项核对 |
| HTML 清洗 | [DOMPurify](https://github.com/cure53/DOMPurify) | 引入前核对打包与许可证 |
| PDF 预览 | [PDF.js](https://github.com/mozilla/pdf.js) | Apache-2.0 |

所有引入的源码片段和依赖都要记录：

- 上游仓库与固定 commit/tag。
- 原许可证和 copyright。
- 修改范围。
- 是否会影响 DailyFlow 的 Apache-2.0 发布。

---

## 5. 建议架构

### 5.1 总体结构

```text
DailyFlow React UI
  ├── Mailbox / Thread / Message
  ├── Attachment Preview
  ├── Composer / Reply Templates
  └── Convert to DailyFlow Actions
              │
              ▼
DailyFlow Mail API
  ├── Account & OAuth
  ├── Thread / Message Query
  ├── Draft / Send
  ├── Label Mutation
  ├── Attachment Download
  └── Sync / Cursor / Audit
              │
              ▼
MailProviderAdapter
  ├── GmailProvider（首发）
  ├── OutlookProvider（后续）
  └── ImapSmtpProvider（后续）
              │
              ▼
Local Cache + Secure Secret Store + DailyFlow SourceItem
```

### 5.2 Provider 接口草案

```ts
interface MailProviderAdapter {
  type: 'gmail' | 'outlook' | 'imap';
  capabilities: MailCapability[];

  connect(): Promise<MailConnectionResult>;
  disconnect(): Promise<void>;
  health(): Promise<MailConnectorHealth>;

  sync(cursor?: string): Promise<MailSyncBatch>;
  listThreads(query: MailThreadQuery): Promise<MailThreadPage>;
  getThread(threadId: string): Promise<MailThread>;
  downloadAttachment(input: AttachmentDownloadInput): Promise<LocalAttachment>;

  createDraft(input: CreateDraftInput): Promise<MailDraft>;
  updateDraft(draftId: string, input: UpdateDraftInput): Promise<MailDraft>;
  deleteDraft(draftId: string): Promise<void>;
  sendDraft(draftId: string, idempotencyKey: string): Promise<MailSendResult>;

  modifyLabels(input: ModifyLabelsInput): Promise<void>;
  markRead(threadId: string, read: boolean): Promise<void>;
  archive(threadId: string): Promise<void>;
}
```

读取和写入权限必须分开授权和展示。`sendDraft`、标签变更、归档等属于外部写操作，必须进入审计记录。

### 5.3 数据模型草案

```ts
type MailAccount = EntityMeta & {
  provider: 'gmail' | 'outlook' | 'imap';
  emailAddress: string;
  displayName?: string;
  connectionState: 'connected' | 'paused' | 'expired' | 'error';
  readScope: string[];
  writeScope: string[];
  lastSyncedAt?: string;
  syncCursor?: string;
};

type MailThread = EntityMeta & {
  accountId: string;
  externalThreadId: string;
  subject: string;
  participantIds: string[];
  messageIds: string[];
  labelIds: string[];
  snippet?: string;
  lastMessageAt: string;
  unread: boolean;
  starred: boolean;
};

type MailMessage = EntityMeta & {
  accountId: string;
  threadId: string;
  externalMessageId: string;
  internetMessageId?: string;
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  sentAt: string;
  textBody?: string;
  sanitizedHtmlBody?: string;
  attachmentIds: string[];
  sourceItemId?: string;
};

type MailAttachment = EntityMeta & {
  messageId: string;
  externalAttachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId?: string;
  localPath?: string;
  contentHash?: string;
  scanState: 'not_downloaded' | 'downloaded' | 'blocked' | 'failed';
};

type ReplyProfile = EntityMeta & {
  name: string;
  accountId?: string;
  match: {
    email?: string;
    domain?: string;
    labelId?: string;
  };
  language?: string;
  tone?: string;
  length?: 'short' | 'medium' | 'detailed';
  instructions?: string;
  signatureId?: string;
};
```

### 5.4 存储原则

- OAuth access/refresh token 只存系统 Keychain/Credential Manager。
- 同步游标、外部 ID、缓存元数据放在 `.dailyflow/` 或专用本地数据库。
- 用户明确保存到工作区的附件才进入可见附件目录。
- 邮件正文默认使用可清除缓存，不自动写入普通 Markdown。
- 只有进入 DailyFlow 工作闭环的邮件才创建 SourceItem。
- SourceItem 保留邮件稳定 ID、会话 ID、账号和原始链接。
- 删除缓存不得连带删除已确认的 Commitment、Decision 或用户保存的附件。

---

## 6. 核心交互

### 6.1 邮件工作台布局

建议采用桌面三栏结构：

```text
┌──────────────┬──────────────────────┬─────────────────────────────┐
│ 账号与标签   │ 邮件/会话列表        │ 正文、附件与行动             │
│              │                      │                             │
│ 收件箱       │ 发件人、主题、摘要   │ 会话串                       │
│ 星标         │ 时间、标签、未读     │ 附件预览                     │
│ 已发送       │                      │ 回复 / 转任务 / 等待回复     │
│ 自定义标签   │                      │                             │
└──────────────┴──────────────────────┴─────────────────────────────┘
```

窄窗口退化为列表 → 会话详情的两级导航，不强行保留三栏。

### 6.2 邮件转行动

用户打开邮件后可执行：

- `提取行动`：生成可审阅 Proposal。
- `加入今日候选`：进入 Today Triage，不直接挤占三件事。
- `转为承诺`：保留发件人、截止时间和原文 Evidence。
- `等待回复`：把 Commitment 转入 `waiting` 状态，并记录等待对象和复查日期。
- `保存附件到项目`：选择项目并建立回链。
- `生成回复`：使用 ReplyProfile 和当前上下文起草。

### 6.3 发送链路

```text
生成或编辑草稿
  → 展示最终收件人、正文、附件和签名
  → 用户确认发送
  → 使用幂等键提交
  → 明确显示发送成功或失败
  → 成功后记录审计与可选 Outcome
```

不得在 AI Agent 后台步骤中自动发送邮件。

---

## 7. 附件策略

### 7.1 支持层级

| 类型 | 首发行为 |
|---|---|
| PNG/JPEG/GIF/WebP | 应用内预览和下载 |
| PDF | 应用内预览、翻页、缩放和下载 |
| TXT/MD/JSON/常见代码 | 限制大小后只读预览 |
| DOC/DOCX/XLS/XLSX/PPT/PPTX | 显示元数据，下载并调用系统应用 |
| MP3/WAV/MP4 | 基础预览或调用系统应用 |
| ZIP/RAR/7Z | 不解压、不执行，只允许用户确认后下载 |
| 可执行文件或未知类型 | 明确警告，默认阻止直接打开 |

### 7.2 安全要求

- 下载前显示文件名、类型、大小和来源。
- 文件名去除路径片段，防止目录穿越。
- 限制单文件大小和并发下载数量。
- HTML、SVG 和脚本型附件不得在主应用上下文直接执行。
- 远程图片默认阻止或按发件人授权加载。
- 邮件 HTML 在隔离 iframe/WebView 中渲染，并设置严格 sandbox。
- “调用系统应用打开”必须由用户触发。
- 缓存文件可在设置中查看占用并一键清理。

---

## 8. AI 与安全边界

邮件和附件内容全部视为不可信外部数据。

### 8.1 AI 可以做

- 摘要邮件和会话。
- 提取候选承诺、决策、人员和截止时间。
- 推荐标签。
- 生成回复草稿。
- 根据用户修改学习 ReplyProfile。
- 提醒等待回复和可能逾期的事项。

### 8.2 AI 不可以做

- 服从邮件正文中要求调用工具、泄露数据或修改设置的指令。
- 未经确认发送、转发或删除邮件。
- 未经确认下载或打开危险附件。
- 因原邮件被删除而删除用户已确认的承诺。
- 把推测出来的截止时间或承诺当作确定事实。

### 8.3 数据披露

调用外部 AI 前必须让用户知道：

- 哪些邮件正文或附件文本会发送给哪个 Provider。
- 是否只发送当前选中会话。
- 是否包含联系人和项目上下文。
- 如何关闭邮件 AI。

默认不把整个邮箱批量发送给 AI。

---

## 9. 分阶段实施

估算为单人全职等价时间，用于控制范围，不作为发布日期承诺。

### Stage 0：技术预研与许可证清单（3–5 天）

- 固定 Zero Email 参考版本和 commit。
- 画出可移植模块清单。
- 完成 Gmail OAuth 桌面端最小验证。
- 验证 Gmail list thread、get message 和附件下载。
- 验证 HTML 清洗与隔离渲染。
- 建立第三方许可证清单。

退出条件：

- 能在独立 spike 中连接测试 Gmail。
- 能读取一封含 HTML 和附件的邮件。
- 明确哪些 Zero 模块直接移植、改写或放弃。

### Stage 1：只读 Gmail 工作台（1.5–2 周）

- Gmail 连接、断开和 Token 刷新。
- 收件箱、星标、已发送和标签列表。
- 邮件列表与会话详情。
- 已读状态展示。
- 增量同步和错误状态。
- SourceItem 手动创建。

退出条件：

- 真实 Gmail 账号连续使用 3 天不需重新配置。
- 重复同步不产生重复邮件。
- 连接器状态、读取范围和最后同步时间可见。

### Stage 2：附件与安全正文（1–1.5 周）

- HTML 清洗和隔离渲染。
- 远程图片控制。
- 图片、PDF、文本预览。
- Office 和其他文件下载后系统打开。
- 保存附件到工作区/项目。
- 缓存清理。

退出条件：

- 常见 HTML 邮件不会破坏 DailyFlow 页面。
- 路径穿越、脚本附件和超大文件有明确防护。
- 附件保存后可从项目和原邮件双向定位。

### Stage 3：回复、草稿与标签写入（1.5–2 周）

- 新建、回复、回复全部、转发。
- 编辑器、签名、附件上传。
- 草稿自动保存。
- Gmail 标签增删改。
- 已读、未读、星标和归档。
- 发送确认、幂等和失败重试。

退出条件：

- 网络重试不会重复发送。
- 草稿退出应用后可恢复。
- 所有外部写操作留下审计记录。

### Stage 4：AI 回复与 DailyFlow 闭环（1–1.5 周）

- 回复模板和 ReplyProfile。
- AI 生成与重写回复。
- 邮件提取 Proposal。
- 转 Commitment、Task、`waiting` 状态和 Evidence。
- 加入 Today 候选。
- 等待回复复查。

退出条件：

- 每个 AI 提议都能回到原始邮件证据。
- AI 回复发送前必须经过普通编辑器和用户确认。
- 邮件删除或同步失败不破坏已确认的 DailyFlow 对象。

### Stage 5：稳定化与内测（1–2 周）

- 多账号基础支持。
- 大邮箱和长会话性能。
- 离线与弱网状态。
- OAuth 过期和权限撤销。
- 安全测试、集成测试和真实账号回归。
- 文档、设置说明和缓存管理。

预计 Gmail 首发总量：约 6–10 周。
Outlook 和通用 IMAP/SMTP 在 Gmail 版本稳定后单独评估。

---

## 10. 测试与发布门槛

### 10.1 功能测试

- OAuth 成功、取消、过期和撤销。
- 收件箱、会话、标签和搜索。
- HTML、纯文本、多部分 MIME 和内联图片。
- 无附件、单附件、多附件和同名附件。
- 回复、回复全部、转发和新建。
- 草稿恢复和发送失败。
- 标签并发修改和同步冲突。
- 邮件转 SourceItem、Commitment，并进入或退出 `waiting` 状态。

### 10.2 安全测试

- HTML XSS 和危险 URL。
- iframe/WebView 越权导航。
- SVG、HTML、JS 和可执行附件。
- 附件文件名路径穿越。
- 超大文件、压缩炸弹和资源耗尽。
- OAuth Token 日志泄露。
- 邮件正文提示注入。
- 重放发送请求和重复发送。

### 10.3 性能门槛

- 首屏优先使用本地缓存，正常情况下 1 秒内出现可用内容。
- 邮件列表虚拟化，不一次渲染完整邮箱。
- 正文和附件按需加载。
- 同步不阻塞 Today、Notes 和 Calendar。
- 单个异常会话不能阻塞整个同步游标。

### 10.4 发布门槛

- Gmail 真实账号内测至少 7 天。
- 无已知重复发送、邮件状态破坏或凭据泄露问题。
- 用户能随时暂停同步、断开连接和清理缓存。
- 写入权限、最后同步时间和错误状态可见。
- AI 不能绕过发送确认。
- 附件危险类型默认安全失败。
- 新功能包含单元测试、集成测试和关键 Playwright 流程。

---

## 11. 成功指标

首发不以“同步了多少封邮件”为核心指标，而关注：

- 每周从邮件识别并确认的真实承诺数。
- 进入 `waiting` 状态且按时复查的承诺数。
- 从邮件保存到项目并被再次使用的附件数。
- AI 回复草稿被用户采用和修改的比例。
- 用户进入邮箱后完成处理而不是只查看的会话比例。
- 重复发送、同步冲突和凭据异常必须接近零。

所有指标默认只保存在本地；上传遥测必须 opt-in。

---

## 12. 默认决策与待确认项

### 12.1 当前默认决策

- Gmail 首发，Outlook 后续。
- 桌面端优先。
- 使用 Gmail API，不在首发中同时实现 IMAP。
- 邮件写入能力属于受控外部执行。
- 邮件正文进入本地缓存，只有进入工作闭环的邮件创建 SourceItem。
- Word、Excel、PPT 首发不做应用内渲染，调用系统应用。
- AI 永不自动发送。
- Zero Email 是主要参考和模块移植来源，但不是新的项目底座。

### 12.2 实现前仍需确认

- 首发是否支持多个 Gmail 账号。
- 是否需要离线查看完整正文，还是只缓存最近/已打开邮件。
- 单附件和总缓存的默认上限。
- Gmail 标签在 DailyFlow UI 中的视觉层级。
- ReplyProfile 是全局优先，还是联系人/组织优先。
- 是否首发支持新建邮件，还是先完成回复链路。
- 内测 OAuth 使用用户自建 Client ID，还是项目统一 Client ID。
- DailyFlow 发布模式是否需要提前完成 Google OAuth 应用审核。

---

## 13. 下次继续时的启动清单

后续开始实现时，先完成以下事项：

1. 阅读本文档和 `AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md` 的 §9、§16、§17、Phase 8。
2. 检查工作区未提交修改，不覆盖用户现有代码。
3. 重新核对 Zero Email、Inbox Zero、Mailspring 和候选依赖的最新许可证。
4. 在临时目录检出固定版本的 Zero Email，只做代码审计，不直接把整个项目拷入 DailyFlow。
5. 输出 `Mail Module Migration Matrix`：
   - 直接使用的 MIT 依赖。
   - 经适配移植的组件。
   - 仅参考交互、不复制的实现。
   - DailyFlow 必须自行实现的本地存储与领域联动。
6. 先完成 Stage 0 spike，经验证后再修改正式架构。
7. 每次只交付一个可验证纵向闭环，并同步更新本文档状态。

推荐第一个纵向闭环：

> 连接一个 Gmail 测试账号 → 展示最近会话 → 打开含附件邮件 → 安全预览正文和附件 → 手动转成一个带原邮件 Evidence 的 DailyFlow SourceItem。
