# 硅基流动（SiliconFlow）转写设置

> 中文会议首选 · 注册送 ¥9.9 体验金 · 3 步搞定

DailyFlow 的云端转写现在原生支持 [硅基流动 SiliconFlow](https://siliconflow.cn/)。接口走的是 OpenAI-Whisper 兼容的 `/v1/audio/transcriptions`，所以服务器零改动。

## 1. 注册并拿 API Key

1. 打开 https://cloud.siliconflow.cn/account/ak
2. 用手机号注册（送 ¥9.9 体验金 ≈ 100+ 小时会议转写）
3. 复制 API Key（形如 `sk-xxxxxxxxxxxxxxxx`）

## 2. 在 DailyFlow 里启用硅基流动转写

录音面板 → 选 **云端转写（硅基流动 / OpenAI ...）** 卡片 → 在下面"Transcription service settings"里：

- Provider：`硅基流动 SiliconFlow（中文会议推荐）`
- Service URL：已经自动填 `https://api.siliconflow.cn/v1`
- API Key：粘贴你刚拿的 Key
- Model name：默认 `FunAudioLLM/SenseVoiceSmall`（中英文都好）；想要更便宜可选 `TeleAI/TeleASR`

## 3. 开始录音

回到会议笔记面板，勾上同意 → 点 **Start recording** → 录音结束后会自动转写。

转写后的文本会以独立 Source 形式保存，可以一键插入笔记。

## 价格

按秒计费，约 ¥0.0001/秒。1 小时会议约 ¥0.36，体验金够用半年。

## 模型推荐

| 模型 | 适合 | 说明 |
|---|---|---|
| `FunAudioLLM/SenseVoiceSmall` | 中英混合会议 | 默认推荐，速度快 |
| `TeleAI/TeleASR` | 纯中文 | 中文识别更好 |

## 常见问题

**Q: 我可以只充一点点钱吗？**
A: 可以，硅基流动支持按量付费，最低充值 ¥1。

**Q: 体验金用完了还能继续用吗？**
A: 体验金用完不强制充值，但继续用需要充值。

**Q: 我已经有 OpenAI Key 了，能直接用吗？**
A: 可以。同一个 provider 下拉里选 `OpenAI`，填你的 OpenAI Key 即可。

**Q: 录音会上传到硅基流动吗？**
A: 是的，会上传音频。但不会上传你的笔记内容、任务、标签等本地数据。
