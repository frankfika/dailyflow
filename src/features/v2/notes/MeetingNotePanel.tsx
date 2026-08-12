import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileAudio, FileText, Loader2, Mic, Settings2, Square, Trash2, X } from 'lucide-react';
import {
  captureNoteMeetingBinary,
  transcribeNoteMeeting,
  getNoteMeetingAudioUrl,
  getLocalTranscriptionConfig,
  getSource,
  saveLocalTranscriptionConfig,
  type MeetingCaptureResult,
  type LocalTranscriptionConfig,
  type LocalTranscriptionStatus,
  type NoteDocument,
  type SourceItem,
} from '../api/client';
import { MEETING_TRANSCRIPTION_PRESETS, isMeetingModelInstalled, loadMeetingTranscriptionSettings, saveMeetingTranscriptionSettings, type MeetingTranscriptionSettings } from './meetingTranscription';

export interface MeetingNotePanelProps {
  note: NoteDocument;
  language?: 'zh' | 'en';
  onNoteUpdated?: (note: NoteDocument, result: MeetingCaptureResult) => void;
  /** Lets the host offer AI cleanup/summary without silently replacing the note body. */
  onTranscriptReady?: (text: string, result: MeetingCaptureResult) => void;
  /** Copies a preserved transcript into the editable Note body on explicit user action. */
  onInsertTranscript?: (text: string) => void | Promise<void>;
}

type RecordingState = 'idle' | 'requesting' | 'recording' | 'ready' | 'saving';

const COPY = {
  zh: {
    title: '会议录音',
    hint: '录音可直接保存；自动转写需要先完成设置。',
    start: '开始录音',
    requesting: '正在请求麦克风…',
    stop: '停止',
    discard: '丢弃',
    save: '保存录音',
    saveAndTranscribe: '保存并转写',
    mode: '转写方式',
    audioLanguage: '录音语言',
    languageAuto: '自动识别',
    languageZh: '中文',
    languageEn: '英文',
    modeLocal: '本地 whisper.cpp',
    modeLocalEndpoint: '本机转写服务',
    modeRemote: '远程模型',
    modeSaveOnly: '仅保存录音',
    localReady: '本地模型已就绪',
    localMissing: '本地转写尚未就绪；录音仍会先保存，可稍后配置路径并重试',
    localEndpointReady: '本机转写服务只允许使用 localhost/127.0.0.1，不会上传到外网',
    queued: '本地转写任务已排队，可稍后重试。',
    saving: '正在保存…',
    remoteReady: '已启用远程转写；Ollama 主要用于后续 AI Chat 总结',
    remoteUnavailable: '当前 Ollama 配置用于 AI Chat，不提供音频转写；录音仍会保存',
    localOnly: '未配置转写模型，将只保存原始录音',
    savedOnly: '录音已保存，你可以稍后配置模型后重新转写。',
    transcriptionFailed: '录音已保存，但远程转写失败，可以稍后重试。',
    transcribed: '录音和转写稿已保存。',
    existingAudio: '已有录音',
    existingTranscript: '已有转写',
    savedRecordings: '已保存的录音',
    latestTranscript: '最新转写稿',
    recording: '会议录音',
    noMicrophone: '当前环境不支持麦克风录音。',
    permissionDenied: '无法访问麦克风，请检查系统或浏览器权限。',
    emptyRecording: '没有录到可保存的音频，请重新录制。',
    recorderFailed: '录音中断，请检查麦克风或音频设备后重试。',
    previewUnavailable: '当前播放器无法预览这段录音，但录音内容仍然完整，可以继续保存。',
    saveFailed: '保存录音失败',
    serviceSettings: '转写服务设置',
    serviceUrl: '服务地址',
    apiKey: 'API Key',
    modelName: '模型名称',
    provider: '服务商',
    diarize: '区分说话人（推荐）',
    speakerCount: '预计人数（0 = 自动）',
    keyterms: '术语 / 人名（逗号分隔）',
    settingsTitle: '转写设置',
    configureTranscription: '配置转写',
    closeSettings: '关闭转写设置',
    transcriptionReady: '录音后自动转写',
    recordingOnly: '当前仅保存录音',
    recordingStep: '准备录音',
    consent: '我已告知参会者，并确认有权录音和处理本次会议内容',
    insertTranscript: '加入笔记并编辑',
    backgroundTranscribing: '录音已保存，本地转写正在后台运行。你可以继续编辑或离开此页面。',
    transcribeLater: '转写这段录音',
    localConfig: '本地 whisper.cpp 设置',
    executablePath: 'whisper-cli 路径',
    modelPath: '模型文件路径',
    ffmpegPath: 'ffmpeg 路径',
    localConfigSaved: '本地转写设置已保存。',
    localNotReady: '本地转写尚未就绪，请确认执行程序和模型文件路径。',
    saveConfig: '保存并检测',
    setupTitle: '先选好录音后的处理方式',
    setupBody: '只录音不需要 AI 或 API Key。自动转写可使用 OpenAI、Deepgram、ElevenLabs 等远程服务（需要对应服务的 API Key），也可使用本地 whisper.cpp（无需 API Key）。',
    setupRemote: '设置远程转写',
    setupRemoteHint: '需要服务商 API Key',
    setupLocal: '设置本地转写',
    setupLocalHint: '无需 API Key',
    apiKeyRequired: '远程自动转写尚未启用：请填写所选服务商的 API Key。录音仍可正常保存。',
  },
  en: {
    title: 'Meeting recording',
    hint: 'Recordings can be saved immediately; automatic transcription needs setup first.',
    start: 'Start recording',
    requesting: 'Requesting microphone…',
    stop: 'Stop',
    discard: 'Discard',
    save: 'Save recording',
    saveAndTranscribe: 'Save & transcribe',
    mode: 'Transcription mode',
    audioLanguage: 'Recording language',
    languageAuto: 'Auto detect',
    languageZh: 'Chinese',
    languageEn: 'English',
    modeLocal: 'Local whisper.cpp',
    modeLocalEndpoint: 'Local transcription service',
    modeRemote: 'Remote model',
    modeSaveOnly: 'Save recording only',
    localReady: 'Local model ready',
    localMissing: 'Local transcription is not ready; the recording will still be saved so you can configure paths and retry later',
    localEndpointReady: 'Local transcription only allows localhost/127.0.0.1 and will not upload audio externally',
    queued: 'Local transcription is queued. You can retry it later.',
    saving: 'Saving…',
    remoteReady: 'Remote transcription enabled; Ollama is mainly for later AI Chat summaries',
    remoteUnavailable: 'The active Ollama config is for AI Chat, not audio transcription; recordings will still be saved',
    localOnly: 'No transcription model configured; the original recording will still be saved',
    savedOnly: 'Recording saved. You can transcribe it later after configuring a model.',
    transcriptionFailed: 'Recording saved, but remote transcription failed. You can retry later.',
    transcribed: 'Recording and transcript saved.',
    existingAudio: 'Recording saved',
    existingTranscript: 'Transcript saved',
    savedRecordings: 'Saved recordings',
    latestTranscript: 'Latest transcript',
    recording: 'Meeting recording',
    noMicrophone: 'Microphone recording is not supported in this environment.',
    permissionDenied: 'Microphone access failed. Check your system or browser permission.',
    emptyRecording: 'No audio was captured. Please record again.',
    recorderFailed: 'Recording stopped unexpectedly. Check the microphone or audio device and try again.',
    previewUnavailable: 'This player cannot preview the recording, but the audio is intact and can still be saved.',
    saveFailed: 'Failed to save recording',
    serviceSettings: 'Transcription service settings',
    serviceUrl: 'Service URL',
    apiKey: 'API Key',
    modelName: 'Model name',
    provider: 'Provider',
    diarize: 'Identify speakers (recommended)',
    speakerCount: 'Expected speakers (0 = auto)',
    keyterms: 'Names / key terms (comma-separated)',
    settingsTitle: 'Transcription settings',
    configureTranscription: 'Set up transcription',
    closeSettings: 'Close transcription settings',
    transcriptionReady: 'Transcribe automatically after recording',
    recordingOnly: 'Recording will be saved without transcription',
    recordingStep: 'Ready to record',
    consent: 'I have notified participants and have the right to record and process this meeting',
    insertTranscript: 'Add to note and edit',
    backgroundTranscribing: 'Recording saved. Local transcription is running in the background; you can keep editing or leave this page.',
    transcribeLater: 'Transcribe this recording',
    localConfig: 'Local whisper.cpp settings',
    executablePath: 'whisper-cli path',
    modelPath: 'Model file path',
    ffmpegPath: 'ffmpeg path',
    localConfigSaved: 'Local transcription settings saved.',
    localNotReady: 'Local transcription is not ready. Check the executable and model paths.',
    saveConfig: 'Save & check',
    setupTitle: 'Choose what happens after recording',
    setupBody: 'Recording and saving do not require AI or an API key. Automatic transcription can use OpenAI, Deepgram, or ElevenLabs with that provider’s API key, or local whisper.cpp without an API key.',
    setupRemote: 'Set up remote transcription',
    setupRemoteHint: 'Provider API key required',
    setupLocal: 'Set up local transcription',
    setupLocalHint: 'No API key required',
    apiKeyRequired: 'Remote transcription is not active yet. Add the selected provider’s API key; recording and saving still work.',
  },
} as const;

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    // DailyFlow's desktop app uses WKWebView. MP4/M4A is substantially more
    // reliable there, especially for long recordings and local blob previews.
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

export function formatMeetingDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60);
  const minutePart = hours > 0 ? minutes % 60 : minutes;
  const clock = `${String(minutePart).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${clock}` : clock;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'm4a';
  return 'webm';
}

export function MeetingNotePanel({
  note,
  language = 'en',
  onNoteUpdated,
  onTranscriptReady,
  onInsertTranscript,
}: MeetingNotePanelProps) {
  const t = COPY[language];
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioPreviewFailed, setAudioPreviewFailed] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'success' | 'warning' | 'info'>('success');
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [showTranscriptionSettings, setShowTranscriptionSettings] = useState(false);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const mountedRef = useRef(true);
  const [transcriptionSettings, setTranscriptionSettings] = useState(loadMeetingTranscriptionSettings);
  const [localConfig, setLocalConfig] = useState<LocalTranscriptionConfig | null>(null);
  const [localStatus, setLocalStatus] = useState<LocalTranscriptionStatus | null>(null);
  const [localConfigSaving, setLocalConfigSaving] = useState(false);
  const [transcribingSourceId, setTranscribingSourceId] = useState<string | null>(null);
  const selectedMode = transcriptionSettings.mode;
  const remoteEndpoint = transcriptionSettings.remoteApiKey
    && transcriptionSettings.remoteBaseUrl
    && transcriptionSettings.remoteModel
    ? {
        apiKey: transcriptionSettings.remoteApiKey,
        baseUrl: transcriptionSettings.remoteBaseUrl,
        model: transcriptionSettings.remoteModel,
        provider: transcriptionSettings.remoteProvider,
        diarize: transcriptionSettings.diarize,
        speakerCount: transcriptionSettings.speakerCount || undefined,
        keyterms: transcriptionSettings.keyterms.split(/[,，\n]/).map(term => term.trim()).filter(Boolean),
      }
    : null;
  const localModelReady = localStatus
    ? localStatus.executable && localStatus.model && localStatus.ffmpeg
    : isMeetingModelInstalled(transcriptionSettings.modelId);
  const canTranscribe = selectedMode === 'remote'
    ? Boolean(remoteEndpoint)
    : selectedMode === 'local-endpoint'
      ? Boolean(transcriptionSettings.localEndpointBaseUrl && transcriptionSettings.localEndpointModel)
      : selectedMode === 'local-managed'
        ? localModelReady
        : false;
  const recordingLanguage = transcriptionSettings.audioLanguage === 'auto'
    ? undefined
    : transcriptionSettings.audioLanguage;

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopTimer();
      if (recorderRef.current?.state !== 'inactive') {
        try { recorderRef.current?.stop(); } catch { /* recorder already stopped */ }
      }
      stopTracks();
    };
  }, [stopTimer, stopTracks]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    let cancelled = false;
    if (note.kind !== 'meeting' || note.sourceIds.length === 0) {
      setSources([]);
      return () => { cancelled = true; };
    }
    Promise.all(note.sourceIds.map((id) => getSource(id).then(({ source }) => source).catch(() => null)))
      .then((items) => {
        if (!cancelled) setSources(items.filter((item): item is SourceItem => item !== null));
      });
    return () => { cancelled = true; };
  }, [note.kind, note.sourceIds]);

  useEffect(() => {
    let cancelled = false;
    getLocalTranscriptionConfig()
      .then(({ config, status, defaults }) => {
        if (cancelled) return;
        setLocalConfig(config ?? defaults ?? null);
        setLocalStatus(status ?? null);
      })
      .catch(() => {
        // Older servers do not expose local ASR status; keep save-only and
        // local-endpoint modes usable without making the panel fail.
      });
    return () => { cancelled = true; };
  }, []);

  const startRecording = async () => {
    setError('');
    setNotice('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(t.noMicrophone);
      return;
    }
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        // Browsers may dispatch a final dataavailable/stop pair after error.
        // Detach those handlers so they cannot replace the actionable device
        // error with an empty-recording message.
        recorder.ondataavailable = null;
        recorder.onstop = null;
        stopTimer();
        stopTracks();
        chunksRef.current = [];
        recorderRef.current = null;
        if (!mountedRef.current) return;
        setAudioBlob(null);
        setAudioUrl(null);
        setState('idle');
        setError(t.recorderFailed);
      };
      recorder.onstop = () => {
        const resolvedMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: resolvedMimeType });
        stopTimer();
        stopTracks();
        if (!mountedRef.current) return;
        if (blob.size === 0) {
          setState('idle');
          setError(t.emptyRecording);
          return;
        }
        setAudioBlob(blob);
        setAudioPreviewFailed(false);
        setAudioUrl(URL.createObjectURL(blob));
        setState('ready');
      };
      recorder.start(1000);
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((Date.now() - startedAtRef.current) / 1000);
      }, 250);
      setState('recording');
    } catch {
      stopTracks();
      setState('idle');
      setError(t.permissionDenied);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
    stopTimer();
  };

  const discardRecording = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setAudioPreviewFailed(false);
    setElapsedSeconds(0);
    setError('');
    setNotice('');
    chunksRef.current = [];
    setState('idle');
  };

  const transcriptionRequest = () => selectedMode === 'remote' && remoteEndpoint
    ? { mode: 'remote' as const, ...remoteEndpoint, language: recordingLanguage }
    : selectedMode === 'local-endpoint'
      ? {
          mode: 'local-endpoint' as const,
          provider: 'openai-compatible' as const,
          baseUrl: transcriptionSettings.localEndpointBaseUrl,
          model: transcriptionSettings.localEndpointModel,
          language: recordingLanguage,
          diarize: false,
        }
      : {
          mode: 'local-managed' as const,
          engine: 'whisper.cpp' as const,
          modelId: transcriptionSettings.modelId,
          language: recordingLanguage,
        };

  const runSavedTranscription = async (captureResult: MeetingCaptureResult) => {
    setTranscribingSourceId(captureResult.audioSource.id);
    setNotice('');
    try {
      const response = await transcribeNoteMeeting(note.id, {
        sourceId: captureResult.audioSource.id,
        transcription: transcriptionRequest(),
      });
      let transcriptSource = response.transcriptSource ?? response.source;
      if (!transcriptSource && response.job?.resultRef?.type === 'source') {
        transcriptSource = (await getSource(response.job.resultRef.id)).source;
      }
      const result: MeetingCaptureResult = {
        ...captureResult,
        note: response.note ?? captureResult.note,
        transcriptSource,
        text: response.text ?? transcriptSource?.body,
        transcriptionMode: selectedMode,
        transcriptionJob: response.job,
      };
      if (!transcriptSource) {
        setNoticeTone('info');
        setNotice(t.queued);
        return;
      }
      setSources((current) => [
        ...current.filter((item) => item.id !== transcriptSource!.id),
        transcriptSource!,
      ]);
      setNoticeTone('success');
      setNotice(t.transcribed);
      onNoteUpdated?.(result.note, result);
      if (result.text) onTranscriptReady?.(result.text, result);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      setNoticeTone('warning');
      setNotice(`${t.transcriptionFailed} ${detail}`);
    } finally {
      setTranscribingSourceId(null);
    }
  };

  const saveRecording = async () => {
    if (!audioBlob) {
      setError(t.emptyRecording);
      return;
    }
    setState('saving');
    setError('');
    setNotice('');
    try {
      const mimeType = audioBlob.type || recorderRef.current?.mimeType || 'audio/webm';
      const captureResult = await captureNoteMeetingBinary(note.id, {
        audio: audioBlob,
        filename: `meeting-${note.id}.${extensionForMimeType(mimeType)}`,
        durationSeconds: Math.round(elapsedSeconds),
        language: recordingLanguage,
      });
      setSources((current) => [
        ...current.filter((item) => item.id !== captureResult.audioSource.id),
        captureResult.audioSource,
      ]);
      onNoteUpdated?.(captureResult.note, captureResult);
      setAudioBlob(null);
      setAudioUrl(null);
      setAudioPreviewFailed(false);
      setElapsedSeconds(0);
      chunksRef.current = [];
      setState('idle');
      if (canTranscribe) {
        await runSavedTranscription(captureResult);
      } else {
        setNoticeTone('info');
        setNotice(t.savedOnly);
      }
    } catch (cause) {
      setError(cause instanceof Error ? `${t.saveFailed}: ${cause.message}` : t.saveFailed);
      setState('ready');
    }
  };

  if (note.kind !== 'meeting') return null;

  const audioCount = sources.filter((source) => source.kind === 'meeting_audio').length;
  const transcriptCount = sources.filter((source) => source.kind === 'meeting_transcript').length;
  const savedAudioSources = sources.filter((source) => source.kind === 'meeting_audio');
  const latestTranscript = [...sources].reverse().find((source) => source.kind === 'meeting_transcript');

  return (
    <section
      aria-label={t.title}
      className="rounded-xl border border-border bg-surface/45 p-3"
      data-testid="meeting-note-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/30">
              <Mic className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-text-primary">{t.title}</h3>
              <p className="truncate text-[11px] leading-4 text-text-muted">{t.hint}</p>
            </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-medium ${canTranscribe ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${canTranscribe ? 'bg-green-500' : 'bg-amber-500'}`} />
            {canTranscribe ? t.transcriptionReady : t.recordingOnly}
          </span>
          <button
            type="button"
            onClick={() => setShowTranscriptionSettings((open) => !open)}
            aria-expanded={showTranscriptionSettings}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-2 py-1 font-medium text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary sm:min-h-0"
          >
            <Settings2 className="h-3 w-3" aria-hidden="true" />
            {t.settingsTitle}
          </button>
        </div>
      </div>

      <div className="mt-3 border-t border-border/70 pt-3">
        {!canTranscribe && state === 'idle' && (
          <div className="mb-3 rounded-lg border border-amber-200/80 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20" data-testid="transcription-setup-callout">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">{t.setupTitle}</p>
            <p className="mt-1 text-[11px] leading-5 text-amber-800/90 dark:text-amber-300/90">{t.setupBody}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = { ...transcriptionSettings, mode: 'remote' as const };
                  setTranscriptionSettings(next);
                  saveMeetingTranscriptionSettings(next);
                  setShowTranscriptionSettings(true);
                }}
                className="rounded-md border border-amber-300 bg-background px-2.5 py-1.5 text-left text-[11px] font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200"
              >
                <span className="block">{t.setupRemote}</span>
                <span className="block font-normal text-amber-700 dark:text-amber-400">{t.setupRemoteHint}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = { ...transcriptionSettings, mode: 'local-managed' as const };
                  setTranscriptionSettings(next);
                  saveMeetingTranscriptionSettings(next);
                  setShowTranscriptionSettings(true);
                }}
                className="rounded-md border border-amber-300 bg-background px-2.5 py-1.5 text-left text-[11px] font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200"
              >
                <span className="block">{t.setupLocal}</span>
                <span className="block font-normal text-amber-700 dark:text-amber-400">{t.setupLocalHint}</span>
              </button>
            </div>
          </div>
        )}
        {state === 'idle' && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex max-w-2xl cursor-pointer items-center gap-2.5 text-xs leading-5 text-text-secondary">
              <input
                type="checkbox"
                checked={recordingConsent}
                onChange={(event) => setRecordingConsent(event.target.checked)}
                className="h-4 w-4 shrink-0 accent-current"
              />
              <span>
                <span className="block text-[11px] text-text-muted">{t.consent}</span>
              </span>
            </label>
            <button
              type="button"
              onClick={startRecording}
              disabled={!recordingConsent}
              className="inline-flex min-h-[40px] min-w-36 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Mic className="h-4 w-4" aria-hidden="true" />
              {t.start}
            </button>
          </div>
        )}
        {state === 'requesting' && (
          <div className="flex min-h-11 items-center justify-center gap-2 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t.requesting}
          </div>
        )}
        {state === 'recording' && (
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 font-mono text-xl font-semibold text-red-600" aria-live="polite">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              {formatMeetingDuration(elapsedSeconds)}
            </span>
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
            >
              <Square className="h-4 w-4 fill-current" aria-hidden="true" />
              {t.stop}
            </button>
          </div>
        )}
        {(state === 'ready' || state === 'saving') && audioUrl && (
          <div className="flex flex-wrap items-center gap-2">
            {audioPreviewFailed ? (
              <p className="min-w-56 flex-1 text-xs text-amber-700" role="status">{t.previewUnavailable}</p>
            ) : (
              <audio
                controls
                src={audioUrl}
                className="h-9 min-w-56 flex-1"
                aria-label={t.title}
                onError={() => setAudioPreviewFailed(true)}
              />
            )}
            <span className="font-mono text-xs text-text-muted">{formatMeetingDuration(elapsedSeconds)}</span>
            <button
              type="button"
              onClick={discardRecording}
              disabled={state === 'saving'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t.discard}
            </button>
            <button
              type="button"
              onClick={saveRecording}
              disabled={state === 'saving'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {state === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {state === 'saving' ? t.saving : canTranscribe ? t.saveAndTranscribe : t.save}
            </button>
          </div>
        )}
      </div>

      {notice && (
        <p className={`mt-2 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs ${noticeTone === 'success' ? 'border-green-200 bg-green-50 text-green-700' : noticeTone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`} role="status" data-testid={`meeting-notice-${noticeTone}`}>
          {noticeTone === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          {notice}
        </p>
      )}
      {transcribingSourceId && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700" role="status" aria-live="polite">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {t.backgroundTranscribing}
        </p>
      )}
      {error && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {showTranscriptionSettings && (
        <div className="mt-3 rounded-xl border border-border bg-surface/80 p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-text-primary">{t.settingsTitle}</p>
              <p className="mt-0.5 text-[11px] text-text-muted">
                {canTranscribe ? t.transcriptionReady : t.recordingOnly}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTranscriptionSettings(false)}
              aria-label={t.closeSettings}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-text-muted hover:bg-surface-elevated hover:text-text-primary sm:min-h-0 sm:min-w-0 sm:p-1.5"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <label htmlFor={`meeting-transcription-mode-${note.id}`} className="text-text-secondary">{t.mode}</label>
        <select
          id={`meeting-transcription-mode-${note.id}`}
          value={selectedMode}
          disabled={state === 'saving'}
          onChange={(event) => {
            const mode = event.target.value as typeof transcriptionSettings.mode;
            const next = { ...transcriptionSettings, mode };
            setTranscriptionSettings(next);
            saveMeetingTranscriptionSettings(next);
          }}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-primary disabled:opacity-60"
        >
          <option value="remote">{t.modeRemote}</option>
          <option value="local-endpoint">{t.modeLocalEndpoint}</option>
          <option value="save-only">{t.modeSaveOnly}</option>
          <option value="local-managed">{t.modeLocal}</option>
        </select>
        <label htmlFor={`meeting-audio-language-${note.id}`} className="ml-1 text-text-secondary">
          {t.audioLanguage}
        </label>
        <select
          id={`meeting-audio-language-${note.id}`}
          value={transcriptionSettings.audioLanguage}
          disabled={state === 'recording' || state === 'saving'}
          onChange={(event) => {
            const audioLanguage = event.target.value as MeetingTranscriptionSettings['audioLanguage'];
            const next = { ...transcriptionSettings, audioLanguage };
            setTranscriptionSettings(next);
            saveMeetingTranscriptionSettings(next);
          }}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-primary disabled:opacity-60"
        >
          <option value="auto">{t.languageAuto}</option>
          <option value="zh">{t.languageZh}</option>
          <option value="en">{t.languageEn}</option>
        </select>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-text-muted">
        {selectedMode === 'remote'
          ? (remoteEndpoint ? t.remoteReady : t.apiKeyRequired)
          : selectedMode === 'local-endpoint'
            ? t.localEndpointReady
            : selectedMode === 'local-managed'
              ? (localModelReady ? t.localReady : t.localMissing)
              : t.localOnly}
      </p>

      {(selectedMode === 'remote' || selectedMode === 'local-endpoint') && (
        <div className="mt-2 rounded-lg border border-border bg-surface/40 px-3 py-2 text-xs">
          <p className="font-medium text-text-secondary">{t.serviceSettings}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {selectedMode === 'remote' && (
              <label className="grid gap-1 text-text-muted">
                <span>{t.provider}</span>
                <select
                  value={transcriptionSettings.remoteProvider}
                  onChange={(event) => {
                    const provider = event.target.value as keyof typeof MEETING_TRANSCRIPTION_PRESETS;
                    const preset = MEETING_TRANSCRIPTION_PRESETS[provider];
                    const next = {
                      ...transcriptionSettings,
                      remoteProvider: provider,
                      remoteBaseUrl: preset.baseUrl,
                      remoteModel: preset.model,
                      diarize: provider !== 'openai-compatible',
                    };
                    setTranscriptionSettings(next);
                    saveMeetingTranscriptionSettings(next);
                  }}
                  className="rounded-md border border-border bg-surface px-2 py-1.5 text-text-primary"
                >
                  <option value="openai">OpenAI</option>
                  <option value="deepgram">Deepgram</option>
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="openai-compatible">OpenAI compatible</option>
                </select>
              </label>
            )}
            <label className="grid gap-1 text-text-muted sm:col-span-2">
              <span>{t.serviceUrl}</span>
              <input
                value={selectedMode === 'remote' ? transcriptionSettings.remoteBaseUrl : transcriptionSettings.localEndpointBaseUrl}
                onChange={(event) => {
                  const next = selectedMode === 'remote'
                    ? { ...transcriptionSettings, remoteBaseUrl: event.target.value }
                    : { ...transcriptionSettings, localEndpointBaseUrl: event.target.value };
                  setTranscriptionSettings(next);
                  saveMeetingTranscriptionSettings(next);
                }}
                className="rounded-md border border-border bg-surface px-2 py-1.5 text-text-primary"
              />
            </label>
            {selectedMode === 'remote' && (
              <label className="grid gap-1 text-text-muted">
                <span>{t.apiKey}</span>
                <input
                  type="password"
                  value={transcriptionSettings.remoteApiKey}
                  onChange={(event) => {
                    const next = { ...transcriptionSettings, remoteApiKey: event.target.value };
                    setTranscriptionSettings(next);
                    saveMeetingTranscriptionSettings(next);
                  }}
                  className="rounded-md border border-border bg-surface px-2 py-1.5 text-text-primary"
                />
              </label>
            )}
            <label className="grid gap-1 text-text-muted">
              <span>{t.modelName}</span>
              <input
                value={selectedMode === 'remote' ? transcriptionSettings.remoteModel : transcriptionSettings.localEndpointModel}
                onChange={(event) => {
                  const next = selectedMode === 'remote'
                    ? { ...transcriptionSettings, remoteModel: event.target.value }
                    : { ...transcriptionSettings, localEndpointModel: event.target.value };
                  setTranscriptionSettings(next);
                  saveMeetingTranscriptionSettings(next);
                }}
                className="rounded-md border border-border bg-surface px-2 py-1.5 text-text-primary"
              />
            </label>
            {selectedMode === 'remote' && (
              <>
                <label className="flex items-center gap-2 text-text-muted">
                  <input
                    type="checkbox"
                    checked={transcriptionSettings.diarize}
                    onChange={(event) => {
                      const next = { ...transcriptionSettings, diarize: event.target.checked };
                      setTranscriptionSettings(next);
                      saveMeetingTranscriptionSettings(next);
                    }}
                  />
                  <span>{t.diarize}</span>
                </label>
                <label className="grid gap-1 text-text-muted">
                  <span>{t.speakerCount}</span>
                  <input
                    type="number"
                    min={0}
                    max={32}
                    value={transcriptionSettings.speakerCount}
                    onChange={(event) => {
                      const next = { ...transcriptionSettings, speakerCount: Number(event.target.value) || 0 };
                      setTranscriptionSettings(next);
                      saveMeetingTranscriptionSettings(next);
                    }}
                    className="rounded-md border border-border bg-surface px-2 py-1.5 text-text-primary"
                  />
                </label>
                <label className="grid gap-1 text-text-muted sm:col-span-2">
                  <span>{t.keyterms}</span>
                  <input
                    value={transcriptionSettings.keyterms}
                    onChange={(event) => {
                      const next = { ...transcriptionSettings, keyterms: event.target.value };
                      setTranscriptionSettings(next);
                      saveMeetingTranscriptionSettings(next);
                    }}
                    className="rounded-md border border-border bg-surface px-2 py-1.5 text-text-primary"
                  />
                </label>
              </>
            )}
          </div>
        </div>
      )}

      {selectedMode === 'local-managed' && localConfig && (
        <details className="mt-2 rounded-lg border border-border bg-surface/40 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-text-secondary">{t.localConfig}</summary>
          <div className="mt-2 grid gap-2">
            <label className="grid gap-1 text-text-muted">
              <span>{t.executablePath}</span>
              <input
                value={localConfig.executablePath}
                onChange={(event) => setLocalConfig({ ...localConfig, executablePath: event.target.value })}
                className="rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-text-primary"
              />
            </label>
            <label className="grid gap-1 text-text-muted">
              <span>{t.modelPath}</span>
              <input
                value={localConfig.modelPath}
                onChange={(event) => setLocalConfig({ ...localConfig, modelPath: event.target.value })}
                className="rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-text-primary"
              />
            </label>
            <label className="grid gap-1 text-text-muted">
              <span>{t.ffmpegPath}</span>
              <input
                value={localConfig.ffmpegPath}
                onChange={(event) => setLocalConfig({ ...localConfig, ffmpegPath: event.target.value })}
                className="rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-text-primary"
              />
            </label>
            <button
              type="button"
              disabled={localConfigSaving}
              onClick={async () => {
                setLocalConfigSaving(true);
                setError('');
                try {
                  const result = await saveLocalTranscriptionConfig(localConfig);
                  setLocalConfig(result.config);
                  setLocalStatus(result.status);
                  setNoticeTone(result.status.executable && result.status.model && result.status.ffmpeg ? 'success' : 'warning');
                  setNotice(result.status.executable && result.status.model && result.status.ffmpeg ? t.localConfigSaved : t.localNotReady);
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : String(cause));
                } finally {
                  setLocalConfigSaving(false);
                }
              }}
              className="w-max rounded-md border border-accent/25 bg-accent/5 px-2.5 py-1.5 font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              {localConfigSaving ? t.saving : t.saveConfig}
            </button>
          </div>
        </details>
      )}
        </div>
      )}

      {(savedAudioSources.length > 0 || latestTranscript?.body) && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {savedAudioSources.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium text-text-secondary">
                {t.savedRecordings} · {audioCount}
              </p>
              <div className="space-y-2">
                {savedAudioSources.map((source, index) => (
                  <div key={source.id} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 truncate text-[11px] text-text-muted">
                      {source.title || `${t.recording} ${index + 1}`}
                    </span>
                    <audio
                      controls
                      preload="metadata"
                      src={getNoteMeetingAudioUrl(note.id, source.id)}
                      className="h-8 min-w-[220px] max-w-full flex-1"
                      aria-label={source.title || `${t.recording} ${index + 1}`}
                    />
                    {canTranscribe ? (
                      <button
                        type="button"
                        disabled={transcribingSourceId === source.id}
                        onClick={() => void runSavedTranscription({
                          note,
                          audioSource: source,
                          transcriptionMode: 'saved-only',
                        })}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-surface disabled:opacity-50 sm:min-h-0 sm:px-2.5"
                      >
                        {transcribingSourceId === source.id && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                        {t.transcribeLater}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowTranscriptionSettings(true)}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 sm:min-h-0 sm:px-2.5"
                      >
                        <Settings2 className="h-3 w-3" aria-hidden="true" />
                        {t.configureTranscription}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {latestTranscript?.body && (
            <details className="rounded-lg border border-border bg-surface/40 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-text-secondary">
                {t.latestTranscript} · {transcriptCount}
              </summary>
              {onInsertTranscript && (
                <button
                  type="button"
                  onClick={() => void onInsertTranscript(latestTranscript.body!)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/5 px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/10"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.insertTranscript}
                </button>
              )}
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-5 text-text-secondary">
                {latestTranscript.body}
              </pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
