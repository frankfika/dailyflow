# Local Whisper Setup (Sprint 1 — Gap 5)

DailyFlow lets you transcribe meeting recordings **without uploading audio to any cloud provider** by delegating to a local [whisper.cpp](https://github.com/ggerganov/whisper.cpp) build. This document walks through the macOS install path and the in-app configuration.

## 1. Install the runtime (macOS)

The fastest path is Homebrew. The two packages below cover whisper.cpp and the ffmpeg sidecar that DailyFlow uses to normalise audio formats.

```bash
brew update
brew install whisper-cpp ffmpeg
```

After the install finishes, verify the binaries:

```bash
which whisper-cli
which ffmpeg
whisper-cli --help  # prints the whisper.cpp usage banner
```

If `whisper-cli` is not on `PATH`, set the executable path explicitly in Settings → Transcription (see step 4).

## 2. Pick and download a model

DailyFlow runs the same `ggml-*.bin` model files as upstream whisper.cpp. Trade-off: bigger models are slower but more accurate.

| Model    | Size  | Notes                                  |
|----------|-------|----------------------------------------|
| `tiny`   | ~75M  | Real-time on most laptops              |
| `base`   | ~140M | Good baseline for English              |
| `small`  | ~460M | **Default suggestion** for mixed CN/EN |
| `medium` | ~1.5G | Slow on CPU, good for noisy audio      |
| `large`  | ~3G   | Best accuracy, GPU recommended         |

Grab a model (example: `small`):

```bash
mkdir -p "$HOME/Library/Application Support/DailyFlow/models/whisper"
curl -L -o "$HOME/Library/Application Support/DailyFlow/models/whisper/ggml-small.bin" \
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
```

> **Tip.** To download a Chinese-tuned variant, pick one of the community fine-tunes on Hugging Face and rename the file to keep the `ggml-*.bin` prefix so the UI can recognise it.

## 3. Sanity-check the binary + model

Transcribe a five-second sample to make sure the path settings are correct before wiring them into DailyFlow:

```bash
whisper-cli -m "$HOME/Library/Application Support/DailyFlow/models/whisper/ggml-small.bin" \
  -f /System/Library/Sounds/Ping.aiff --no-timestamps

# Optional: transcribe a real m4a recording (ffmpeg normalises it first).
ffmpeg -y -i recording.m4a -ar 16000 -ac 1 -c:a pcm_s16le /tmp/rec.wav
whisper-cli -m "$HOME/Library/Application Support/DailyFlow/models/whisper/ggml-small.bin" \
  -f /tmp/rec.wav --no-timestamps
```

If you see the transcript printed to stdout, the local backend is ready.

## 4. Configure DailyFlow

1. Open **Settings → Transcription** (the tab between AI Models and Sync).
2. Pick **Local Whisper (whisper.cpp)**.
3. Fill in the four fields:
   - `whisper.cpp executable path` — typically `whisper-cli` (PATH lookup) or `/opt/homebrew/bin/whisper-cli`.
   - `Model path` — absolute path to the `ggml-*.bin` file from step 2.
   - `ffmpeg path` — leave `ffmpeg` unless your ffmpeg lives outside `PATH`.
   - `Language` — `auto`, `zh`, or `en`.
4. Click **Test Connection**. The server checks each binary on disk and shows a green/amber status badge with the missing piece (if any).
5. Click **Save**. The settings are persisted in `localStorage` (`dailyflow.transcription.local`) and in the workspace `transcription.json`.

From now on, every meeting recording will be transcribed locally. While transcription is running, the meeting panel shows a badge that reads **Local Whisper** so you can confirm which engine is in use.

## 5. Switching back to OpenAI

Open **Settings → Transcription** and pick **OpenAI Whisper (cloud)**. DailyFlow immediately starts sending future recordings to the provider selected in the AI Models tab. Existing transcripts stay in the workspace and are never re-uploaded.

## 6. Troubleshooting

| Symptom                                  | Likely cause                                          | Fix                                                                                                                |
|------------------------------------------|-------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `Test Connection` reports `executable`   | `whisper-cli` not on `PATH` and no absolute path set. | Set the executable field to the absolute path printed by `which whisper-cli`.                                       |
| Test reports `model` missing             | `ggml-*.bin` path is wrong or the file is partial.    | Re-download with `curl -C - …` or pick a smaller model.                                                             |
| Test reports `ffmpeg` missing            | ffmpeg not installed.                                 | `brew install ffmpeg` or point the field to a vendored binary.                                                      |
| Whisper runs but text is empty           | Wrong language hint.                                  | Set Language to `auto` or pick the correct ISO code (`zh`, `en`).                                                  |
| `permission denied` errors               | SIP / TCC blocks the binary.                          | Move the executable under `/usr/local/bin` or `/opt/homebrew/bin` (the canonical Homebrew prefix on Apple Silicon). |

## 7. Why local-first matters

Slide 05 of the roadshow deck promises "0 byte uploads" for recordings — keeping the audio path on-device is the only way that promise stays honest. The backend already separates the local transcription route (`POST /api/v2/notes/:id/meeting/transcribe-local`) from the remote capture path, so once the local backend is configured DailyFlow never has a reason to send the audio over the network.

---

## See also

- **[SILICONFLOW_TRANSCRIPTION.md](./SILICONFLOW_TRANSCRIPTION.md)** — 中文会议首选云端方案，注册送 ¥9.9 体验金，无需装模型。
- **`docs/VOICE_NOTE_REVIEW_2026-09-06.md`** — 2026-09-06 review 与小白推荐三档方案。
