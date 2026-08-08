# DailyFlow 会议 AI 模型与质量指南

> 决策基线：2026-08-08。供应商能力和价格会变化，上线前应使用真实会议样本重新评测。

## 产品结论

会议能力必须是可恢复、可核验的流水线，而不是“一次模型调用”：

1. **Capture**：先把原始录音原子写入当前 Note 的附件目录；用户必须确认已告知参会者并有权录音。
2. **ASR**：转写与录音保存解耦，可重试、可换模型；结果保留时间戳和说话人标签。
3. **Meeting Notes**：AI 生成草稿，但不得覆盖原始转写或用户手写内容。
4. **Evidence**：决定、承诺、等待项和未决问题必须引用转写中的原文位置。
5. **Review**：所有对外承诺、负责人、截止日期和决定均由用户确认后进入系统。

默认远程组合建议：

- **中文/中英混合会议 ASR：Deepgram Nova-3 + `diarize_model=latest`**。
- **最省接入成本的 ASR：OpenAI `gpt-4o-transcribe-diarize`**。
- **多人、说话人区分优先：ElevenLabs `scribe_v2`**。
- **纪要与结构化提取：GPT-5.6 Luna；高风险会议改用 GPT-5.6 Terra**。
- **严格隐私：本机 whisper.cpp + Whisper large-v3-turbo（设备不足时 small）+ 本地 Qwen3 Instruct**。

## ASR Options

| 方案 | 推荐场景 | 优点 | 主要代价/限制 | DailyFlow 状态 |
| --- | --- | --- | --- | --- |
| Deepgram Nova-3 | 默认中文、混合语言、噪声或远场会议 | 2026-03 已支持简繁中文；可用新版 batch diarizer；支持术语提示、格式化和 utterances | 专有 API；远程上传；说话人分离单独计费 | 已内置 provider preset |
| OpenAI gpt-4o-transcribe-diarize | 希望最少配置、统一 OpenAI 账户 | 原生说话人分离；单次 Transcription API；接入简单 | 不应假定任意 OpenAI-compatible 服务都支持 `diarized_json` | 已内置 provider preset |
| ElevenLabs Scribe v2 | 多人会议、姓名/术语多、需要细粒度时间戳 | 90+ 语言、word timestamps、最多 32 speakers、keyterms | 专有 API；成本与数据政策需单独评估 | 已内置 provider preset |
| AssemblyAI Universal-3.5 Pro | 英语/支持语言内、异步批处理、希望成熟的 diarization | 18 语言、native code switching、speaker diarization、价格透明 | 中文是否在当前 18 种语言内必须以账户/官方列表实测；异步 API 需独立 adapter | 推荐 option，尚未接入 |
| whisper.cpp | 私密会议、离线环境 | 音频不出本机；成本可控；模型可锁定 | 单独使用没有可靠 speaker diarization；大模型在低配设备较慢 | 已支持本地执行路径 |

### 本地模型档位

- **质量优先**：Whisper large-v3-turbo 的量化版本；建议 Apple Silicon 16GB 以上先实测。
- **平衡档**：Whisper medium；中文准确率通常优于 small，但延迟和磁盘占用更高。
- **速度优先**：Whisper small；适合普通笔记草稿，不应用于高风险数字、金额或人名的免复核记录。
- **说话人分离**：本地方案需另接 pyannote 等 diarization pipeline；未接入前 UI 不得声称本地可以识别人名或可靠区分多人。

## 纪要与提取模型 Options

| 档位 | 模型建议 | 用法 |
| --- | --- | --- |
| 默认 | GPT-5.6 Luna，低或中等 reasoning | 高吞吐结构化纪要、决定/行动项/未决问题提取；使用 JSON Schema |
| 高风险 | GPT-5.6 Terra，中等 reasoning | 投融资、法务、重大客户、金额和日期密集会议；仍需人工确认 |
| 本地平衡 | Qwen3 30B-A3B Instruct（资源不足用 8B） | 中文整理和私密内容；必须通过项目真实样本评测 schema 合规率与引用准确率 |
| 低成本旧设备 | Qwen3 4B Instruct | 只生成摘要草稿，不自动提取承诺或决定 |

ASR 和纪要模型必须分开配置。Ollama 文本模型不能代替 ASR；远程 ASR 也不应直接拥有写任务或修改笔记的权限。

## 标准会议记录结构

AI 输出必须覆盖以下字段，未知项写“待确认”，不得编造：

1. 会议元信息：标题、开始/结束时间、时长、地点/链接、主持人、记录人、参会人和议程。
2. 一句话总结和背景。
3. 核心结论。
4. 按议题整理的讨论详情：各方观点、原话、数据、分歧和结论。
5. 决策记录：决定内容、参与决策人、理由和异议。
6. 行动项：What、Who、When，以及可选的 Why、How、优先级和依赖。
7. 未决问题和延期决策。
8. 附录：所有提到的数字、文件、链接与来源。

## 质量门槛

不要只测 Word Error Rate。使用至少 20 段自有会议录音，覆盖中文、夹杂英文、多人、远场、噪声、数字、人名和产品术语，记录：

- CER/WER；
- 人名、公司名、金额、日期的 entity recall；
- speaker attribution accuracy / diarization error；
- 决定、行动项、负责人、截止日期的 precision/recall；
- 引用是否为原文子串、时间戳是否可定位；
- JSON Schema 合规率；
- 60 分钟会议的端到端时延、失败率和成本；
- 用户复核后的修改量。

上线 gate：原始录音保存成功率必须高于任何模型指标；模型失败必须可重试；没有证据引用的决定和承诺不得自动写入。

## 下一阶段

1. 把浏览器内存中的录音 chunk 持续写到 Tauri 文件，支持崩溃恢复和超长会议。
2. 增加系统音频 + 麦克风双轨采集，并明确展示当前采集源。
3. 将本地转写从请求生命周期迁到可恢复 worker，支持取消、进度、重试与应用重启续跑。
4. 增加 speaker rename，并把同一 speaker 在全文中的标签一致替换。
5. 增加模型评测命令和固定黄金集；按 workspace 保存最终选型，不凭供应商 benchmark 决策。
6. 把 API Key 从 localStorage 迁到系统 Keychain/Secret Store。

## 官方参考

- OpenAI GPT-4o Transcribe Diarize: https://developers.openai.com/api/docs/models/gpt-4o-transcribe-diarize
- OpenAI GPT-5.6 model guidance: https://developers.openai.com/api/docs/guides/latest-model
- Deepgram Nova-3 中文支持: https://developers.deepgram.com/changelog/2026/3/31
- Deepgram speaker diarization: https://developers.deepgram.com/docs/diarization
- Deepgram pricing: https://deepgram.com/pricing
- ElevenLabs Speech-to-Text: https://elevenlabs.io/docs/overview/capabilities/speech-to-text
- AssemblyAI pricing/models: https://www.assemblyai.com/pricing/
- Ollama Qwen3 tags: https://ollama.com/library/qwen3/tags
