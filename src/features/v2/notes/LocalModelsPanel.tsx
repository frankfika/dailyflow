/** LocalModelsPanel — the one-stop picker for the on-device Whisper model.
 *
 * Surfaces the server-side ggml-* catalog, exposes a "download" button per
 * model, and reflects progress via a Server-Sent Events subscription. When
 * the host is missing `whisper-cli` or `ffmpeg` it also surfaces the exact
 * brew/apt/winget line so the user can fix it in one terminal paste.
 *
 * This is the "no terminal beyond `brew install …`" view of the local
 * Whisper pipeline. The user no longer has to chase Hugging Face download
 * URLs or hand-edit `transcription.json` paths.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronUp, Download, ExternalLink, Loader2, Mic, RefreshCw, Sparkles, X } from 'lucide-react';
import {
  useApplyDownloadedModel,
  useDownloadLocalModel,
  useLocalAsrModels,
  useLocalModelEvents,
  useSystemCheck,
  type LocalModelCatalogEntry,
  type LocalModelInstalled,
  type ModelDownloadProgress,
} from '../hooks/useLocalAsrModels';

export interface LocalModelsPanelProps {
  language?: 'zh' | 'en';
}

const COPY = {
  zh: {
    title: '本地模型',
    body: '在 dailyflow 内一键下载 ggml Whisper 模型，存到应用目录里，不再需要终端拷贝。',
    systemOk: '本机已就绪：whisper-cli 和 ffmpeg 都能直接调用。',
    systemMissing: '本机缺以下命令：',
    installHint: '复制这条命令到终端运行：',
    catalog: '可选模型',
    installed: '已下载',
    noInstalled: '还没有下载任何模型',
    download: '下载',
    downloading: '下载中…',
    delete: '删除',
    openDir: '打开模型目录',
    progress: '下载进度',
    completed: '已就绪',
    failed: '下载失败',
    mirrorHint: '从 Hugging Face 镜像',
    useThis: '用这个模型',
    usingThis: '当前正在用',
    applyFailed: '写入设置失败',
    applyOk: '已设为本地模型路径',
    ariaProgressBar: '下载进度条',
    ariaDownload: (label: string) => `下载 ${label}`,
    ariaUseModel: (label: string) => `把 ${label} 设为本地转写模型`,
    ariaCopyCommand: '复制安装命令',
    ariaRefresh: '刷新本地模型',
    refresh: '刷新',
    expandPanel: '展开本地模型面板',
    collapsePanel: '收起本地模型面板',
    collapse: '收起',
    showModels: '查看模型',
    checkingHost: '检测本机环境…',
    copied: '已复制',
    copy: '复制',
    networkError: '无法连接服务端，请检查网络后重试。',
    downloadFailed: '下载失败',
    applyErrorPrefix: '写入设置失败：',
    downloadErrorPrefix: '下载失败：',
    bytesOf: (done: string, total: string) => `${done} / ${total}`,
    openFolder: '模型目录',
    dismiss: '关闭提示',
  },
  en: {
    title: 'Local models',
    body: 'Download ggml Whisper checkpoints from inside DailyFlow — saved to the app data folder, no terminal required.',
    systemOk: 'Host is ready: whisper-cli and ffmpeg are both available.',
    systemMissing: 'Missing on the host:',
    installHint: 'Copy this command into your terminal:',
    catalog: 'Available models',
    installed: 'Installed',
    noInstalled: 'No models installed yet',
    download: 'Download',
    downloading: 'Downloading…',
    delete: 'Remove',
    openDir: 'Open model folder',
    progress: 'Progress',
    completed: 'Ready',
    failed: 'Failed',
    mirrorHint: 'Mirrored from Hugging Face',
    refresh: 'Refresh',
    useThis: 'Use this model',
    usingThis: 'Currently in use',
    applyFailed: 'Failed to apply',
    applyOk: 'Set as the local model path',
    ariaProgressBar: 'Download progress',
    ariaDownload: (label: string) => `Download ${label}`,
    ariaUseModel: (label: string) => `Use ${label} as the local transcription model`,
    ariaCopyCommand: 'Copy install command',
    ariaRefresh: 'Refresh local models',
    expandPanel: 'Expand local models panel',
    collapsePanel: 'Collapse local models panel',
    collapse: 'Hide',
    showModels: 'Show models',
    checkingHost: 'Checking the host…',
    copied: 'Copied',
    copy: 'Copy',
    networkError: 'Could not reach the server. Check your connection and retry.',
    downloadFailed: 'Download failed',
    applyErrorPrefix: 'Failed to apply: ',
    downloadErrorPrefix: 'Download failed: ',
    bytesOf: (done: string, total: string) => `${done} / ${total}`,
    openFolder: 'Model folder',
    dismiss: 'Dismiss',
  },
} as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function LocalModelsPanel({ language = 'en' }: LocalModelsPanelProps) {
  const t = COPY[language];
  const models = useLocalAsrModels();
  const download = useDownloadLocalModel(models.refetch);
  const apply = useApplyDownloadedModel();
  const systemCheck = useSystemCheck();
  const { events } = useLocalModelEvents();
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  // Per-model request errors (download / apply). Keyed by catalog id so each
  // row can render its own inline message — the hooks expose a single `error`
  // slot that can't be attributed to a row after they reset their variables.
  const [requestErrors, setRequestErrors] = useState<Record<string, string | null>>({});
  const timerRef = useRef<number | null>(null);
  // Row whose config-write is in flight, set synchronously on click so the
  // button disables and spins for the duration of the request.
  const [applyingModelId, setApplyingModelId] = useState<string | null>(null);
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);
  // Auto-expand exactly once, the first time the host check comes back ready.
  // The model picker is the headline feature of this panel — hiding it behind
  // a bare "+" glyph meant new users never found it. We only force it open
  // once so an explicit user collapse is never overridden.
  const autoExpandedRef = useRef(false);
  // Tracks which model the user just applied so we can show a confirmation
  // and let the parent react. Cleared after 4s so stale highlights don't
  // outlive the actual success.
  const [appliedModelId, setAppliedModelId] = useState<string | null>(null);
  // Maps installed filename -> the catalog entry's id so we can compute
  // "is this the model I'm currently using" for the success badge.
  const catalogIdByFilename = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of models.data?.catalog ?? []) {
      map.set(entry.filename, entry.id);
    }
    return map;
  }, [models.data?.catalog]);

  // Stable lookup so we can render progress next to the catalog entry.
  const installedByFilename = useMemo(() => {
    const out = new Map<string, LocalModelInstalled>();
    for (const entry of models.data?.installed ?? []) {
      out.set(entry.filename, entry);
    }
    return out;
  }, [models.data?.installed]);

  const catalog: LocalModelCatalogEntry[] = models.data?.catalog ?? [];
  const missingCommands = useMemo(() => {
    const missing: string[] = [];
    if (!systemCheck.data?.whisperCliPath) missing.push('whisper-cli');
    if (!systemCheck.data?.ffmpegPath) missing.push('ffmpeg');
    return missing;
  }, [systemCheck.data]);

  const systemReady = systemCheck.data?.ready ?? false;

  // Auto-expand once when the host turns out ready — see autoExpandedRef.
  useEffect(() => {
    if (systemReady && !autoExpandedRef.current) {
      autoExpandedRef.current = true;
      setExpanded(true);
    }
  }, [systemReady]);

  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const expandedRef = useRef<HTMLDivElement | null>(null);

  // Focus management: move focus into the expanded region on open and back to
  // the toggle on close. Without this, a keyboard user tabs straight past the
  // entire model list (it appears *after* the toggle in DOM order, but focus
  // stays where it was, so the new content is never reached).
  const toggleExpanded = useCallback(() => {
    setExpanded((value) => {
      const next = !value;
      // Defer to after the render that mounts/unmounts the region.
      window.setTimeout(() => {
        if (next) {
          expandedRef.current?.focus();
        } else {
          toggleRef.current?.focus();
        }
      }, 0);
      return next;
    });
  }, []);

  async function copyInstallCommand() {
    const cmd = systemCheck.data?.installCommand?.command;
    if (!cmd) return;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      // Ignore — the user can still select-and-copy manually.
    }
  }

  function progressFor(modelId: string): ModelDownloadProgress | undefined {
    return events[modelId];
  }

  return (
    <section
      className="mt-3 rounded-xl border border-border bg-surface/70 p-3"
      aria-label={t.title}
      data-testid="local-models-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-text-primary inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" aria-hidden="true" /> {t.title}
          </p>
          <p className="mt-0.5 text-[12px] text-text-muted">{t.body}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            ref={toggleRef}
            type="button"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            aria-label={expanded ? t.collapsePanel : t.expandPanel}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary sm:min-h-0"
            data-testid="local-models-toggle"
          >
            {expanded ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
            {expanded ? t.collapse : t.showModels}
          </button>
          <button
            type="button"
            onClick={() => {
              models.refetch();
              systemCheck.refetch();
            }}
            aria-label={t.ariaRefresh}
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md px-2 py-1 text-[12px] font-medium text-text-muted hover:bg-surface-elevated hover:text-text-primary sm:min-h-0 sm:min-w-0"
            data-testid="local-models-refresh"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-2 rounded-lg border border-border/70 bg-background/60 p-2 text-[12px]">
        {systemCheck.isLoading ? (
          <span className="inline-flex items-center gap-1.5 text-text-muted">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            {t.checkingHost}
          </span>
        ) : systemCheck.error ? (
          // Distinguish "couldn't ask the server" from "the server said the
          // tools are missing". Telling an offline user to `brew install
          // ffmpeg` when they already have it is actively misleading.
          <div className="flex flex-wrap items-center gap-2" data-testid="system-check-error">
            <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-3 w-3" aria-hidden="true" /> {t.networkError}
            </span>
            <button
              type="button"
              onClick={() => systemCheck.refetch()}
              className="inline-flex min-h-[36px] items-center rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-elevated"
              data-testid="system-check-retry"
            >
              {t.refresh}
            </button>
          </div>
        ) : systemReady ? (
          <span className="inline-flex items-center gap-1.5 text-green-700 dark:text-green-300">
            <Check className="h-3 w-3" aria-hidden="true" /> {t.systemOk}
          </span>
        ) : (
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
              <X className="h-3 w-3" aria-hidden="true" /> {t.systemMissing}{' '}
              <span className="font-mono text-amber-900 dark:text-amber-200">
                {missingCommands.join(', ')}
              </span>
            </span>
            {systemCheck.data?.installCommand && (
              <div className="flex flex-wrap items-center gap-2">
                <code
                  className="block max-w-full overflow-x-auto rounded bg-surface px-2 py-1 font-mono text-[11px] text-text-heading"
                  data-testid="system-install-command"
                >
                  {systemCheck.data.installCommand.command}
                </code>
                <button
                  type="button"
                  onClick={() => void copyInstallCommand()}
                  className="inline-flex min-h-[36px] items-center rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-elevated"
                  data-testid="system-install-copy"
                  aria-label={t.ariaCopyCommand}
                >
                  {copyState === 'copied' ? t.copied : t.copy}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div
          ref={expandedRef}
          tabIndex={-1}
          className="mt-3 space-y-3 outline-none"
          data-testid="local-models-expanded"
          role="region"
          aria-label={t.title}
          aria-live="polite"
        >
          <div>
            <p className="text-[12px] font-medium text-text-secondary">{t.catalog}</p>
            {models.error && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-amber-700 dark:text-amber-300" role="alert" data-testid="local-models-catalog-error">
                <AlertCircle className="h-3 w-3" aria-hidden="true" /> {t.networkError}
              </p>
            )}
            <ul className="mt-2 space-y-2">
              {catalog.map((entry) => (
                <ModelRow
                  key={entry.id}
                  entry={entry}
                  installed={installedByFilename.get(entry.filename)}
                  progress={progressFor(entry.id)}
                  language={language}
                  isDownloading={download.isPending && download.variables === entry.id}
                  isApplying={applyingModelId === entry.id}
                  applied={appliedModelId === entry.id}
                  requestError={requestErrors[entry.id] ?? null}
                  onDownload={() => {
                    // Clear any prior error, then record a new one on failure.
                    // `download.error` alone can't be keyed to a row because the
                    // hook resets `variables` in its `finally`.
                    setRequestErrors((cur) => ({ ...cur, [entry.id]: null }));
                    download.mutate(entry.id).catch((cause: unknown) => {
                      const message = cause instanceof Error ? cause.message : String(cause);
                      setRequestErrors((cur) => ({ ...cur, [entry.id]: message || t.downloadFailed }));
                    });
                  }}
                  onApply={(installedRecord) => {
                    setRequestErrors((cur) => ({ ...cur, [entry.id]: null }));
                    // Track the in-flight row ourselves: `apply.isPending` flips
                    // back to false in the hook's `finally` before this success
                    // handler can set `appliedModelId`, so a hook-derived
                    // isApplying never rendered — and a stale id from a previous
                    // success would mark the wrong row busy.
                    setApplyingModelId(entry.id);
                    apply
                      .mutate({ modelPath: installedRecord.path })
                      .then(() => {
                        setAppliedModelId(entry.id);
                        timerRef.current = window.setTimeout(() => {
                          setAppliedModelId((current) => (current === entry.id ? null : current));
                        }, 4000);
                      })
                      .catch((cause: unknown) => {
                        const message = cause instanceof Error ? cause.message : String(cause);
                        setRequestErrors((cur) => ({ ...cur, [entry.id]: `${t.applyErrorPrefix}${message}` }));
                      })
                      .finally(() => {
                        setApplyingModelId((current) => (current === entry.id ? null : current));
                      });
                  }}
                />
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[12px] font-medium text-text-secondary">{t.installed}</p>
            {installedByFilename.size === 0 ? (
              <p className="mt-1 text-[12px] text-text-muted">{t.noInstalled}</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {Array.from(installedByFilename.values()).map((entry) => (
                  <li
                    key={entry.filename}
                    className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5 text-[12px]"
                  >
                    <Mic className="h-3 w-3 text-text-muted" aria-hidden="true" />
                    <span className="font-medium text-text-heading">{entry.filename}</span>
                    <span className="text-text-muted">{formatBytes(entry.sizeBytes)}</span>
                    <span className="ml-auto text-text-muted">
                      {new Date(entry.installedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {models.data?.directory && (
            <p className="text-[11px] text-text-muted">
              {t.openDir}: <code className="font-mono">{models.data.directory}</code>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

interface ModelRowProps {
  entry: LocalModelCatalogEntry;
  installed?: LocalModelInstalled;
  progress?: ModelDownloadProgress;
  language: 'zh' | 'en';
  isDownloading: boolean;
  isApplying: boolean;
  applied: boolean;
  /** Inline error from the download / apply request (not the SSE stream). */
  requestError?: string | null;
  onDownload: () => void;
  onApply: (installed: LocalModelInstalled) => void;
}

function ModelRow({ entry, installed, progress, language, isDownloading, isApplying, applied, requestError, onDownload, onApply }: ModelRowProps) {
  const t = COPY[language];
  const isInFlight = progress && (progress.state === 'started' || progress.state === 'progress');
  const percent = progress?.percent ?? (installed ? 100 : 0);
  const status = progress?.state ?? (installed ? 'completed' : 'idle');
  const label = status === 'completed' ? t.completed : status === 'failed' ? t.failed : isInFlight ? t.downloading : t.download;

  return (
    <li
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-2"
      data-testid={`local-model-row-${entry.id}`}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text-heading">{entry.label}</span>
            <span className="text-[11px] text-text-muted">~{entry.approxSizeMb} MB</span>
          </div>
          <div className="text-[11px] text-text-muted">
            {entry.bestFor.length > 0 ? entry.bestFor.join(' · ') : ''} · {t.mirrorHint}
          </div>
        </div>
        {installed && status !== 'failed' ? (
          <div className="flex flex-col items-end gap-1">
            <span
              className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-950/30 dark:text-green-300"
              data-testid={`local-model-status-${entry.id}`}
              data-status="completed"
            >
              <Check className="h-3 w-3" aria-hidden="true" /> {t.completed}
            </span>
            <button
              type="button"
              onClick={() => onApply(installed)}
              disabled={isApplying}
              aria-busy={isApplying}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-accent/30 bg-accent/5 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10 disabled:opacity-50 sm:min-h-0"
              data-testid={`local-model-use-${entry.id}`}
              aria-label={t.ariaUseModel(entry.label)}
            >
              {isApplying ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3 w-3" aria-hidden="true" />}
              {applied ? t.usingThis : t.useThis}
            </button>
          </div>
        ) : status === 'failed' ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300"
            data-testid={`local-model-status-${entry.id}`}
            data-status="failed"
          >
            <X className="h-3 w-3" aria-hidden="true" /> {t.failed}
          </span>
        ) : (
          <button
            type="button"
            onClick={onDownload}
            disabled={isDownloading || isInFlight}
            aria-busy={Boolean(isDownloading || isInFlight)}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50 sm:min-h-0"
            data-testid={`local-model-download-${entry.id}`}
            aria-label={t.ariaDownload(entry.label)}
          >
            {isDownloading || isInFlight ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-3 w-3" aria-hidden="true" />
            )}
            {label}
          </button>
        )}
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface"
        role="progressbar"
        aria-label={t.ariaProgressBar}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-valuetext={`${Math.round(percent)}%`}
      >
        <div
          className={`h-full ${status === 'failed' ? 'bg-red-400' : 'bg-accent'} transition-[width] duration-300`}
          style={{ width: `${Math.min(100, percent)}%` }}
          data-testid={`local-model-progress-${entry.id}`}
          data-percent={percent}
          aria-hidden="true"
        />
      </div>
      {isInFlight && progress?.bytes !== undefined && progress.totalBytes ? (
        <p className="text-[10px] text-text-muted" data-testid={`local-model-bytes-${entry.id}`}>
          {t.bytesOf(formatBytes(progress.bytes), formatBytes(progress.totalBytes))}
        </p>
      ) : null}
      {progress?.error && (
        <p className="text-[11px] text-danger" role="alert">{progress.error}</p>
      )}
      {requestError && (
        // HTTP-level failure (proxy blocked the mirror, disk full, server
        // down). Previously this was swallowed entirely — the user clicked
        // Download and nothing happened.
        <p className="inline-flex items-start gap-1 text-[11px] text-danger" role="alert" data-testid={`local-model-request-error-${entry.id}`}>
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{requestError}</span>
        </p>
      )}
      {installed && !isInFlight && (
        <p className="text-[10px] text-text-muted">
          <ExternalLink className="mr-0.5 inline h-2.5 w-2.5" aria-hidden="true" />
          <code className="font-mono break-all">{installed.path}</code>
        </p>
      )}
    </li>
  );
}