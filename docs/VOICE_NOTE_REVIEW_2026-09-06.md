# 语音笔记（Voice Note）创建流程 Review

> Author：陈放 / Codex · Date：2026-09-06
> 范围：录音 → 转写 → 入笔记 全链路，重点解决"小白用户不知道选哪个模型"的问题

---

## TL;DR

- **Ollama 不能做语音转写**。它只跑 LLM / embedding，没有 ASR 模型。继续把 Ollama 当 STT 选项会误导用户。
- **硅基流动（SiliconFlow）可以做**，而且是 OpenAI-Whisper 兼容接口，注册送 ¥9.9 体验金，足够小白用半年。**当前 dailyflow 没把它放进 transcription preset**，要加。
- **本地 Whisper（whisper.cpp）已经接好**，门槛是 `brew install whisper-cpp` + 下载一个 460MB ggml 模型。
- 推荐把当前 4-mode × 4-provider × 6-field 的"工程师控制台"砍成 **3 个一键预设**：保存 / 本地 Whisper / 硅基流动，每个预设 1~3 步配好。

---

## 一、现状摸底

### 1.1 用户入口

| 入口 | 文件 | 创建的 Note kind | 是否进 MeetingNotePanel |
|---|---|---|---|
| NoteList 列表头部 `+ 新建` 按钮 | `src/features/v2/notes/NoteList.tsx:255` | `general` | 否（看不到录音） |
| NoteList 列表中红色 Mic 卡片 `会议笔记` | `src/features/v2/notes/NoteList.tsx:295` | `meeting` | 是 |
| ChatInputArea 右侧 Mic 图标 | `src/components/ChatInputArea.tsx:153` → `src/App.tsx:200` | `meeting` | 是 |
| Home 页面 / 一键开始会议 | 同上 | `meeting` | 是 |

→ 三条路汇合到 `MeetingNotePanel`，所以"会议笔记"按钮的命名是合理的；但入口措辞容易让用户误以为是"语音便签"（不是必须开会）。

### 1.2 当前转写选择 UI（MeetingNotePanel.tsx:725-740）

入场黄底 callout "先选好录音后的处理方式"，两个按钮：
- `设置远程转写`（标注：需要服务商 API Key）
- `设置本地转写`（标注：无需 API Key）

展开后是 `<select>` 下拉 + 4 个 mode：

| mode | 字段数 | 用户体感 |
|---|---|---|
| `remote` | 6+ 字段（provider、baseUrl、apiKey、model、diarize、speakerCount、keyterms） | 工程师界面 |
| `local-endpoint` | 2 字段，baseUrl 默认 `http://127.0.0.1:8080/v1`，**没告诉用户怎么起这个服务** | 神秘 |
| `save-only` | 0 字段 | 简单，但入口太隐蔽 |
| `local-managed` | 4 字段 + 一个 brew 命令（`brew install whisper-cpp ffmpeg`）+ 下载 460MB 模型 | 太重 |

**总控件数 ≈ 30+**，没有任何"推荐 / 一键选 / 复制命令"引导。

### 1.3 Settings → Transcription 标签页

`src/components/TranscriptionSettingsSection.tsx` 也提供 backend 切换（OpenAI / Local），与面板内 mode 切换是两套独立存储（`localStorage` 里的 `dailyflow.transcription.backend` vs `dailyflow.transcription.local`）。

→ 用户在两个地方配置同一个东西，很容易配错。

---

## 二、Ollama 能不能转写？—— 不能

| 检查项 | 结果 |
|---|---|
| `ollama pull` 支持音频模型？ | 否，Ollama library 没有 ASR 模型 |
| Ollama HTTP API 暴露 `/v1/audio/transcriptions`？ | 否，仅暴露 `/api/chat`、`/api/embeddings`、`/api/generate` |
| 社区方案 | 有 `ollama-asr` 这种外挂 Python wrapper，但需要用户自己装 Python + 写脚本，不是小白路径 |

**结论**：把 Ollama 当 STT 选项会让用户白忙活。**继续保持它作为"AI Chat 后端"即可**（已经在 dailyflow 里接好）。

如果用户坚持"全部本地、零云"，唯一靠谱的是：

| 方案 | 难度 | Mac Apple Silicon 性能 | 模型大小 |
|---|---|---|---|
| whisper.cpp（当前） | 1 步 brew | 中 | 75M ~ 3G |
| mlx-whisper | `pip install mlx-whisper` | **快 3~5 倍** | 75M ~ 1.5G |
| faster-whisper | `pip install faster-whisper` | 中 | 同上 |

`mlx-whisper` 跑起来后可以挂上 mlx-whisper-server（第三方项目），自动暴露 `http://127.0.0.1:8178/v1/audio/transcriptions`，刚好对应 dailyflow 的 `local-endpoint` mode——**未来可作为 Apple Silicon 用户的加速选项**。

---

## 三、硅基流动能不能转写？—— 能，而且便宜

| 检查项 | 结果 |
|---|---|
| 官方文档 | https://docs.siliconflow.cn/cn/api-reference/audio/create-transcription |
| Endpoint | `POST https://api.siliconflow.cn/v1/audio/transcriptions`（OpenAI Whisper 兼容） |
| 推荐模型 | `FunAudioLLM/SenseVoiceSmall`（中英文都好）、`TeleAI/TeleASR` |
| 价格 | 注册送 ¥9.9 体验金，按秒计费 ≈ ¥0.0001/秒 → 1 小时会议约 ¥0.36 |
| 注册拿 Key | https://cloud.siliconflow.cn/account/ak |

**结论**：硅基流动可以作为远程 preset 直接接入。**当前 dailyflow 在 `MEETING_TRANSCRIPTION_PRESETS` 里没有它**，这是个明显缺漏。

---

## 四、推荐给小白的三档方案（"选一个就行"）

> **设计原则**：把 30+ 控件砍成 3 张大卡片，每张卡片只有 1~3 步可执行的操作。

### 4.1 卡片 A：只保存录音（零配置）

- **谁用**：会议没人帮忙记，开完会自己凭印象补几句
- **步骤**：点 `开始录音` → 结束 → `保存录音`，录音文件留在 Note 的 sources 里
- **现状**：已经支持，但入口藏得深
- **改动**：在 MeetingNotePanel 顶部直接放这张卡，默认选中

### 4.2 卡片 B：本地 Whisper（推荐 · 小白首选）

**适用**：不想花钱、不想注册、不上传音频

**3 步搞定**（macOS Apple Silicon 验证过的命令）：

```bash
# 第 1 步：装运行环境
brew install whisper-cpp ffmpeg

# 第 2 步：下载模型（约 460MB，中英文都能识别）
mkdir -p "$HOME/Library/Application Support/DailyFlow/models/whisper"
curl -L -o "$HOME/Library/Application Support/DailyFlow/models/whisper/ggml-small.bin" \
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
```

UI 上对应**一键按钮**：
- `复制安装命令`（把上面两行 brew + curl 拷到剪贴板）
- `打开模型下载页`（备用方案）
- `Test Connection` → 绿勾即好

### 4.3 卡片 C：硅基流动（推荐 · 中文会议）

**适用**：中文会议多、想准确一点、不想装模型

**3 步搞定**：

```
第 1 步：注册硅基流动并拿 API Key
        → https://cloud.siliconflow.cn/account/ak （送 ¥9.9 体验金）

第 2 步：在 DailyFlow 里粘贴 API Key
        → Settings → AI Models → 添加"硅基流动" provider，填入 Key

第 3 步：在会议面板选 "云端转写（硅基流动）"
        → 模型默认 FunAudioLLM/SenseVoiceSmall，可改 TeleAI/TeleASR
```

UI 上对应：
- `去注册拿 Key`（外链）
- `粘贴 Key`（弹窗）

---

## 五、UI 改动建议（最小化）

### 5.1 替换 MeetingNotePanel 的黄底 callout

把当前的"两个按钮"换成 **3 张横向卡片**：

```
┌─────────────────────────────────────────────────────────────────┐
│ 选一个就行 · 后面随时可以换                                       │
├───────────────┬──────────────────────┬──────────────────────────┤
│ ○ 只保存录音   │ ● 本地 Whisper        │ ○ 云端转写                │
│   零配置      │   免费·隐私·无 Key     │   ¥9.9 体验金·中文更强    │
│   [就用这个]   │   [3 步配置]           │   [1 个 Key 搞定]         │
└───────────────┴──────────────────────┴──────────────────────────┘
```

选完后下方展开对应配置面板：

- 选 A → 直接显示录音按钮（不需要再配）
- 选 B → 显示 `复制安装命令` + `Test Connection`
- 选 C → 显示 `API Key` 单输入框 + `去注册拿 Key` 链接

### 5.2 添加硅基流动 preset

在 `src/features/v2/notes/meetingTranscription.ts` 的 `MEETING_TRANSCRIPTION_PRESETS` 加：

```ts
'siliconflow': {
  baseUrl: 'https://api.siliconflow.cn/v1',
  model: 'FunAudioLLM/SenseVoiceSmall',
},
```

并在 MeetingNotePanel 的 provider 下拉里加 `<option value="siliconflow">硅基流动 SiliconFlow</option>`。

### 5.3 删掉（或弱化）`local-endpoint` mode

当前 `local-endpoint`（默认 `http://127.0.0.1:8080/v1`）没有内置任何服务，对小白是死路。短期保留但**挪到高级设置折叠面板里**，避免出现在推荐路径。未来给 mlx-whisper-server 用户用。

### 5.4 合并两套配置存储

`dailyflow.transcription.backend`（localStorage）和 `dailyflow.transcription.local`（localStorage）是另一套。两个地方配同一件事容易错——把 backend 选择合并到 `loadMeetingTranscriptionSettings().mode` 即可，废弃旧的 `TRANSCRIPTION_BACKEND_STORAGE_KEY`。

---

## 六、文档改动建议

1. **README_ZH.md 第 4 节"会议转写"** 加一句："中文会议推荐硅基流动（¥9.9 体验金）"。
2. **`docs/LOCAL_WHISPER_SETUP.md`** 拆成两段：
   - 顶部"3 步搞定"（brew + curl + UI 操作）
   - 底部"原理 / 进阶 / 自定义模型路径"折叠
3. 新建 **`docs/SILICONFLOW_TRANSCRIPTION.md`**（100 行内）：
   - 注册 → 拿 Key → 粘贴 → 完成
   - 截图：填 Key 的位置、转写后的笔记片段
4. **`docs/FEATURE_AUDIT.md`** 加一行：支持硅基流动 ASR preset

---

## 七、改动工作量估算

| 任务 | 行数估计 | 风险 |
|---|---|---|
| 加硅基流动 preset | ~15 行 | 极低（已 OpenAI 兼容） |
| 改 MeetingNotePanel callout 为 3 卡片 | ~80 行 | 低（纯展示） |
| 弱化 local-endpoint | ~5 行 | 极低 |
| 合并 backend 存储 | ~30 行 + 测试 | 中（要兼容老用户 localStorage） |
| 写两个 markdown 文档 | ~200 行 | 0 |
| 一键复制安装命令按钮 | ~20 行 | 极低 |

**总计 ≈ 1 个前端工程师 0.5~1 天**。

---

## 八、给用户的最终推荐话术（可贴在 README 或 onboarding）

> **录音后怎么处理？选一个就行，随时可以换。**
>
> 1. **只想录下来** → 点 `开始录音` → `保存`，零配置
> 2. **想白嫖本地**（推荐新手）→ `brew install whisper-cpp ffmpeg` → 在设置里 `Test Connection` → 完事
> 3. **想用云端中文更强**（推荐中文用户）→ 去 [硅基流动](https://cloud.siliconflow.cn/account/ak) 注册拿 Key（送 ¥9.9 体验金） → 粘到设置里 → 完事
>
> Ollama 跑的是 AI 聊天模型，不会转写音频。如果你要"全部本地"，装本地 Whisper 就行。
