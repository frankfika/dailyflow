# DailyFlow 会议 AI 架构

## 结论

模型选型、质量门槛和可配置方案见 [MEETING_AI_MODEL_GUIDE.md](./MEETING_AI_MODEL_GUIDE.md)。

会议能力拆成三个相互独立的阶段，不再把“聊天模型”当作“语音模型”：

1. **Capture**：浏览器录音后先原子写入当前 Note 的附件目录。任何模型故障都不能影响原始录音保存。
2. **ASR**：从已保存的音频异步或稍后生成 transcript SourceItem。支持本机 `whisper.cpp`、本机 OpenAI-compatible 语音服务，以及远程 Whisper-compatible 服务。
3. **Reasoning**：把已经生成的文字交给 AI Chat 做总结、决定和行动项提取。这里可以使用 Ollama，也可以使用远程聊天模型。

```text
Microphone -> durable audio -> ASR transcript -> AI summary / actions
                 |                 |                    |
              always local     local or remote      Ollama or remote
```

## 唯一产品入口与存储

- 聊天工具栏和 `⌘/Ctrl + Shift + R` 都创建 `kind: meeting` 的 V2 NoteDocument，并直接打开该笔记的录音面板。
- 录音只走 `/api/v2/notes/:id/meeting/capture`；旧 `/api/meetings`、独立 MeetingCapture 弹窗和 `~/.dailyflow/recordings` 写入器已经下线。
- 原始音频、转写稿和 Evidence 都由会议 Note 的 `sourceIds` 关联，不能再写入另一套 Notes 数据树。
- 历史 `~/.dailyflow/recordings` 文件不会自动删除；需要显式迁移或人工确认。

## Model Center

模型配置只有一个注册表，但按职责分配：

- **Chat**：日常 AI Chat 使用的文本模型；
- **Meeting summary / extraction**：结构化提取决定、承诺、负责人和截止日期；
- **Speech transcription**：本地 whisper.cpp、本地语音端点或远程 ASR。

旧 `df_provider_configs` 与 `df_meeting_transcription_settings` 会无损迁移到 `df_model_center`。桌面端把统一配置持久化为后端 `modelCenter`；`V2_AI_*` 环境变量只作为无界面部署和测试的显式覆盖。

## 为什么不是只用 Ollama

Ollama 适合运行文本或多模态推理模型，但它不是 DailyFlow 的音频转写接口。默认本地组合应是：

- `whisper.cpp` 或本机 faster-whisper 服务负责语音转文字；
- Ollama 负责会议纪要整理、摘要、决定和行动项；
- 原始录音与转写稿都作为 Note 的独立 SourceItem 保留，可重试、审计和替换模型。

## UX 原则

- “保存录音”必须快速完成，转写在保存之后独立运行。
- 没有转写模型时只提示“已保存，可稍后转写”，绝不生成伪转写。
- 已保存的每段录音都提供重新转写入口。
- 本地模型状态由服务端实际检测执行文件和模型文件，不由浏览器中的字符串标记冒充。
- transcript 不自动覆盖用户手写笔记；用户明确选择后才能插入正文或交给 AI 整理。

## 当前部署边界

- 本机 ASR 可配置 `whisper-cli`、模型文件和 `ffmpeg` 路径。
- 本机 OpenAI-compatible ASR 只允许 `localhost`、`127.0.0.1` 或 `::1`。
- Ollama / LM Studio 等聊天服务允许精确回环地址；局域网、通配和 link-local 地址仍被代理层拦截。
- 远程 ASR 继续禁止私网目标，避免代理被用于 SSRF。

## 后续演进

- 将本地转写执行从请求生命周期迁移到可恢复 worker，应用重启后自动续跑 queued/running JobRecord。
- 增加模型下载器、校验和、磁盘占用展示与卸载流程；在完成前不要显示“已安装”。
- 增加分段转写和 VAD，使长会议在录制中即可产生草稿，并在结束后统一校正。
- 对敏感会议提供“仅本地”策略，禁止远程 ASR 与远程总结。
