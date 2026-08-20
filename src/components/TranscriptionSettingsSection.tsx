/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Settings → Meeting Transcription section.
 *
 * Surfaces the user-facing toggle between OpenAI Whisper (cloud) and
 * a local whisper.cpp binary. When the local backend is selected we expose
 * four inputs (executable path, model path, ffmpeg path, language) plus a
 * "Test Connection" button that calls transcriptionApi.testLocalConfig().
 *
 * State is mirrored into localStorage (so transcribeMeeting() can read it
 * without an async hop) and into the server config (so the runner can pick
 * it up on the next /transcribe-local request).
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Cloud, HardDrive } from 'lucide-react';
import {
  transcriptionApi,
  type LocalTranscriptionConfigStatus,
} from '../api/client';
import {
  DEFAULT_LOCAL_WHISPER_CONFIG,
  LOCAL_WHISPER_CONFIG_STORAGE_KEY,
  TRANSCRIPTION_BACKEND_STORAGE_KEY,
  localWhisperConfigToApiInput,
  type LocalWhisperConfig,
  type TranscriptionBackend,
} from '../features/v2/notes/meetingTranscription';

export interface TranscriptionSettingsSectionProps {
  language: 'en' | 'zh';
  showSettings: boolean;
  configTab: string;
}

const STRINGS = {
  en: {
    title: 'Meeting Transcription',
    subtitle: 'Choose which engine transcribes your meeting audio. Local Whisper keeps recordings on this device.',
    backend: 'Transcription Backend',
    backendOpenai: 'OpenAI Whisper (cloud)',
    backendOpenaiHint: 'Audio is sent to the selected remote provider. Requires an API key in the AI Models tab.',
    backendLocal: 'Local Whisper (whisper.cpp)',
    backendLocalHint: 'Audio never leaves this device. Requires whisper-cli and a ggml model on disk.',
    executable: 'whisper.cpp executable path',
    executableHint: 'Absolute path to whisper-cli (or whisper.cpp main) on this device.',
    model: 'Model path',
    modelHint: 'Absolute path to a ggml-*.bin model file (e.g. ggml-small.bin).',
    ffmpeg: 'ffmpeg path',
    ffmpegHint: 'Absolute path to ffmpeg. Leave as "ffmpeg" to use PATH lookup.',
    language: 'Language',
    languageAuto: 'Auto-detect',
    languageZh: 'Chinese',
    languageEn: 'English',
    test: 'Test Connection',
    testing: 'Testing...',
    save: 'Save',
    saving: 'Saving...',
    saved: 'Saved.',
    testOk: 'Executable, model and ffmpeg are reachable.',
    testFail: (detail) => `Test failed: ${detail}`,
    testHelp: `Run "brew install whisper-cpp ffmpeg" to install the runtime. Place ggml model files under ~/Library/Application Support/DailyFlow/models/whisper/.`,
    backendNote: 'Settings are stored locally and synced to the workspace config.',
  },
  zh: {
    title: '会议转写',
    subtitle: '选择转写引擎。本地 Whisper 让录音全程不出本机。',
    backend: '转写后端',
    backendOpenai: 'OpenAI Whisper（云端）',
    backendOpenaiHint: '音频会上传到所选远程服务商。需在“AI 模型”页填入 API Key。',
    backendLocal: '本地 Whisper（whisper.cpp）',
    backendLocalHint: '音频不出本机。需要 whisper-cli 与 ggml 模型文件。',
    executable: 'whisper.cpp 可执行文件路径',
    executableHint: '本机 whisper-cli（或 whisper.cpp 主程序）的绝对路径。',
    model: '模型路径',
    modelHint: 'ggml-*.bin 模型文件的绝对路径（例如 ggml-small.bin）。',
    ffmpeg: 'ffmpeg 路径',
    ffmpegHint: 'ffmpeg 绝对路径，留空或填 "ffmpeg" 则从 PATH 查找。',
    language: '语言',
    languageAuto: '自动检测',
    languageZh: '中文',
    languageEn: '英语',
    test: '测试连接',
    testing: '测试中...',
    save: '保存',
    saving: '保存中...',
    saved: '已保存',
    testOk: '可执行文件、模型与 ffmpeg 都可用。',
    testFail: (detail) => `测试失败：${detail}`,
    testHelp: `执行 brew install whisper-cpp ffmpeg 安装运行环境；将 ggml 模型放到 ~/Library/Application Support/DailyFlow/models/whisper/。`,
    backendNote: '设置同时写入本地存储与工作区配置。',
  },
} as const;

function loadInitialBackend(): TranscriptionBackend {
  try {
    return (typeof localStorage !== "undefined"
      && localStorage.getItem(TRANSCRIPTION_BACKEND_STORAGE_KEY) === "local")
      ? "local"
      : "openai";
  } catch {
    return "openai";
  }
}

function loadInitialConfig(): LocalWhisperConfig {
  try {
    const raw = typeof localStorage !== "undefined"
      ? localStorage.getItem(LOCAL_WHISPER_CONFIG_STORAGE_KEY)
      : null;
    if (!raw) return { ...DEFAULT_LOCAL_WHISPER_CONFIG };
    const parsed = JSON.parse(raw) as Partial<LocalWhisperConfig>;
    return {
      executablePath: parsed.executablePath?.trim() || DEFAULT_LOCAL_WHISPER_CONFIG.executablePath,
      modelPath: parsed.modelPath?.trim() || DEFAULT_LOCAL_WHISPER_CONFIG.modelPath,
      ffmpegPath: parsed.ffmpegPath?.trim() || DEFAULT_LOCAL_WHISPER_CONFIG.ffmpegPath,
      language: parsed.language?.trim() || DEFAULT_LOCAL_WHISPER_CONFIG.language,
    };
  } catch {
    return { ...DEFAULT_LOCAL_WHISPER_CONFIG };
  }
}

export function TranscriptionSettingsSection({
  language,
  showSettings,
  configTab,
}: TranscriptionSettingsSectionProps) {
  const t = STRINGS[language];
  const [backend, setBackend] = useState<TranscriptionBackend>(loadInitialBackend);
  const [config, setConfig] = useState<LocalWhisperConfig>(loadInitialConfig);
  const [serverDefaults, setServerDefaults] = useState<LocalWhisperConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<LocalTranscriptionConfigStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!showSettings || configTab !== "transcription") return;
    let cancelled = false;
    transcriptionApi.getLocalConfig()
      .then((result) => {
        if (cancelled) return;
        if (result.config) {
          setConfig({
            executablePath: result.config.executablePath,
            modelPath: result.config.modelPath,
            ffmpegPath: result.config.ffmpegPath || "ffmpeg",
            language: result.config.language || "auto",
          });
        }
        if (result.defaults) {
          setServerDefaults({
            executablePath: result.defaults.executablePath,
            modelPath: result.defaults.modelPath,
            ffmpegPath: result.defaults.ffmpegPath,
            language: result.defaults.language,
          });
        }
        if (result.status) setStatus(result.status);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [showSettings, configTab]);

  const handleBackendChange = (next: TranscriptionBackend) => {
    setBackend(next);
    try { localStorage.setItem(TRANSCRIPTION_BACKEND_STORAGE_KEY, next); } catch { /* ignore */ }
    setSavedAt(null);
  };

  const handleFieldChange = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setSavedAt(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const resultStatus = await transcriptionApi.testLocalConfig(localWhisperConfigToApiInput(config));
      setStatus(resultStatus);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      try { localStorage.setItem(LOCAL_WHISPER_CONFIG_STORAGE_KEY, JSON.stringify(config)); } catch { /* ignore */ }
      const result = await transcriptionApi.setLocalConfig(localWhisperConfigToApiInput(config));
      setStatus(result.status);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const allReady = status?.executable && status?.model && status?.ffmpeg;

  return (
    <div className="space-y-5" data-testid="transcription-settings-section">
      <div>
        <h3 className="font-sans text-sm font-bold text-text-heading">{t.title}</h3>
        <p className="mt-1 text-xs leading-5 text-text-muted">{t.subtitle}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t.backend}>
        <BackendOption
          active={backend === "openai"}
          icon={<Cloud className="h-4 w-4" />}
          label={t.backendOpenai}
          hint={t.backendOpenaiHint}
          onClick={() => handleBackendChange("openai")}
          testId="transcription-backend-openai"
        />
        <BackendOption
          active={backend === "local"}
          icon={<HardDrive className="h-4 w-4" />}
          label={t.backendLocal}
          hint={t.backendLocalHint}
          onClick={() => handleBackendChange("local")}
          testId="transcription-backend-local"
        />
      </div>

      {backend === "local" && (
        <div className="space-y-4 rounded-md border border-border bg-background p-4" data-testid="transcription-local-fields">
          <Field
            label={t.executable}
            hint={t.executableHint}
            value={config.executablePath}
            placeholder={serverDefaults?.executablePath || DEFAULT_LOCAL_WHISPER_CONFIG.executablePath}
            onChange={(value) => handleFieldChange("executablePath", value)}
            testId="transcription-executable"
          />
          <Field
            label={t.model}
            hint={t.modelHint}
            value={config.modelPath}
            placeholder={serverDefaults?.modelPath || "~/Library/Application Support/DailyFlow/models/whisper/ggml-small.bin"}
            onChange={(value) => handleFieldChange("modelPath", value)}
            testId="transcription-model"
          />
          <Field
            label={t.ffmpeg}
            hint={t.ffmpegHint}
            value={config.ffmpegPath}
            placeholder={DEFAULT_LOCAL_WHISPER_CONFIG.ffmpegPath}
            onChange={(value) => handleFieldChange("ffmpegPath", value)}
            testId="transcription-ffmpeg"
          />
          <div>
            <label htmlFor="transcription-language" className="font-sans text-xs font-bold text-text-muted">
              {t.language}
            </label>
            <select
              id="transcription-language"
              data-testid="transcription-language"
              value={config.language}
              onChange={(event) => handleFieldChange("language", event.target.value)}
              className="mt-1.5 block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text-heading shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="auto">{t.languageAuto}</option>
              <option value="zh">{t.languageZh}</option>
              <option value="en">{t.languageEn}</option>
            </select>
          </div>

          {status && (
            <div
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                allReady
                  ? "border-green-300 bg-green-50/70 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200"
                  : "border-amber-300 bg-amber-50/70 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
              }`}
              data-testid="transcription-status"
            >
              {allReady ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <div>
                <p className="font-semibold" data-testid="transcription-status-message">
                  {allReady ? t.testOk : t.testFail(
                    [
                      status.executable ? null : "executable",
                      status.model ? null : "model",
                      status.ffmpeg ? null : "ffmpeg",
                    ].filter(Boolean).join(", "),
                  )}
                </p>
                <p className="mt-1 text-[11px] leading-4 opacity-90">{t.testHelp}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50/70 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !config.executablePath || !config.modelPath}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-text-heading shadow-sm transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="transcription-test"
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {testing ? t.testing : t.test}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !config.executablePath || !config.modelPath}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="transcription-save"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {saving ? t.saving : t.save}
              </button>
            </div>
            {savedAt && (
              <span className="text-[11px] text-text-muted" data-testid="transcription-saved">
                <CheckCircle2 className="mr-1 inline h-3 w-3 align-text-bottom" /> {t.saved}
              </span>
            )}
          </div>

          <p className="text-[11px] text-text-muted">{t.backendNote}</p>
        </div>
      )}
    </div>
  );
}

function BackendOption({
  active,
  icon,
  label,
  hint,
  onClick,
  testId,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      data-testid={testId}
      className={`flex h-full items-start gap-3 rounded-md border px-3 py-3 text-left transition-all ${
        active
          ? "border-accent bg-accent/5 ring-1 ring-accent"
          : "border-border bg-background hover:border-text-muted"
      }`}
    >
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          active ? "bg-accent text-white" : "bg-surface text-text-muted"
        }`}
      >
        {icon}
      </span>
      <span>
        <span className="block text-xs font-bold text-text-heading">{label}</span>
        <span className="mt-1 block text-[11px] leading-4 text-text-muted">{hint}</span>
      </span>
    </button>
  );
}

function Field({
  label,
  hint,
  value,
  placeholder,
  onChange,
  testId,
}: {
  label: string;
  hint: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  testId: string;
}) {
  return (
    <div>
      <label className="font-sans text-xs font-bold text-text-muted">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
        className="mt-1.5 block w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-text-heading shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <p className="mt-1 text-[11px] text-text-muted">{hint}</p>
    </div>
  );
}
