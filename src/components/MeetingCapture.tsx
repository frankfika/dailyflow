/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Granola × DailyFlow — Phase 2 meeting capture modal.
 *
 * Pipeline (Phase 2):
 *   1. Input step — title + participants; choose "Paste transcript" (Phase 1
 *      mock) OR "Record audio" (Phase 2 MediaRecorder → real Whisper via
 *      `/api/meetings/transcribe`).
 *   2. Transcribe — for audio, the server saves the file to
 *      `~/.dailyflow/recordings/{date}/{uuid}.{ext}` and forwards to the
 *      OpenAI-compatible Whisper endpoint configured in Models & Skills.
 *      For text, the existing Phase 1 mock segments are produced.
 *   3. Organize — the LLM rewrites the transcript into the 4-section
 *      Markdown template (Agenda / Decisions / Action Items / Next Meeting)
 *      and extracts action items in one LLM call.
 *   4. Review — user edits Markdown and ticks which action items become
 *      today's tasks. Tasks are stamped with `#meeting-link:{note-id}` so
 *      Notes can round-trip back to the source meeting.
 *
 * The component deliberately mirrors the language of the existing
 * AI Summary / NoteEditor panels so the UX feels native to DailyFlow.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Users, Clock, FileText, X, Loader2, Sparkles, Plus, Check, ListChecks, Square, Circle, AlertTriangle, ClipboardPaste } from 'lucide-react';
import { meetingsApi, notesApi, tasksApi, type MeetingActionItem, type MeetingSegment } from '../api/client';
import { getActiveAiConfig as getActiveAiConfigShared } from '../types/models';
import { getFriendlyAiErrorMessage } from '../utils/aiErrorMessage';
import { getTodayStr } from '../utils/tagColors';

type Step = 'input' | 'record' | 'organize' | 'review' | 'saving';
type InputMode = 'paste' | 'record';

interface MeetingCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'en' | 'zh';
  activeContext: 'work' | 'life';
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  /** Called after the meeting_note is saved so the parent can refresh. */
  onSaved?: () => void;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function nowDateStr(): string {
  return getTodayStr();
}

function nowTimeStr(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${pad2(m)}:${pad2(s)}`;
}

function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  for (const mt of candidates) {
    if (MediaRecorder.isTypeSupported(mt)) return mt;
  }
  return '';
}

export function MeetingCapture({ isOpen, onClose, language, activeContext, showToast, onSaved }: MeetingCaptureProps) {
  // Form state
  const [title, setTitle] = useState('');
  const [participantsText, setParticipantsText] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('paste');
  const [transcript, setTranscript] = useState('');

  // Pipeline state
  const [step, setStep] = useState<Step>('input');
  const [segments, setSegments] = useState<MeetingSegment[]>([]);
  const [markdown, setMarkdown] = useState('');
  const [actionItems, setActionItems] = useState<MeetingActionItem[]>([]);
  const [pickedItems, setPickedItems] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');

  // Recording state
  const [recordingState, setRecordingState] = useState<'idle' | 'requesting' | 'recording' | 'stopped' | 'error'>('idle');
  const [recordingError, setRecordingError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string>('');
  const [audioLevel, setAudioLevel] = useState(0); // 0..1 RMS for the level meter
  const [transcriptionModeEcho, setTranscriptionModeEcho] = useState<'whisper' | 'mock' | 'mock-with-audio' | ''>('');
  const [recordingPathEcho, setRecordingPathEcho] = useState<string>('');

  // Refs that need to survive renders without re-creating effects
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('');

  const participants = useMemo(
    () => participantsText.split(/[,，\n]/).map(p => p.trim()).filter(Boolean),
    [participantsText]
  );

  // Reset on open so the next meeting starts clean.
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setParticipantsText('');
      setTranscript('');
      setInputMode('paste');
      setSegments([]);
      setMarkdown('');
      setActionItems([]);
      setPickedItems(new Set());
      setError('');
      setStep('input');
      setRecordingState('idle');
      setRecordingError('');
      setElapsed(0);
      setAudioBlob(null);
      setAudioMimeType('');
      setAudioLevel(0);
      setTranscriptionModeEcho('');
      setRecordingPathEcho('');
      recordedChunksRef.current = [];
    }
  }, [isOpen]);

  // Stop tracks + clear timers when the modal closes mid-recording.
  useEffect(() => {
    if (!isOpen) {
      stopAllRecording();
    }
    return () => {
      stopAllRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Escape to close (skip when in INPUT/RECORDING state and focus is in a field)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement;
      const isEditing = target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isEditing || e.isComposing) return;
      if (recordingState === 'recording') {
        // Don't allow Escape to drop a recording mid-flight; the user must
        // hit Stop explicitly. This avoids losing audio when Esc is hit
        // accidentally.
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, recordingState]);

  // --- Recording helpers ---

  const stopAllRecording = useCallback(() => {
    if (levelTimerRef.current !== null) {
      window.clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const startRecording = async () => {
    setRecordingError('');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setRecordingState('error');
      setRecordingError(language === 'zh'
        ? '当前环境不支持麦克风 (浏览器无 getUserMedia API).'
        : 'Microphone API not available in this environment.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setRecordingState('error');
      setRecordingError(language === 'zh'
        ? '当前环境不支持 MediaRecorder API. 请升级浏览器或换用粘贴转录模式.'
        : 'MediaRecorder API not available. Please upgrade your browser or paste a transcript instead.');
      return;
    }
    setRecordingState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = pickRecorderMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const finalMime = mimeTypeRef.current || recorder.mimeType || 'audio/webm';
        const blob = new Blob(recordedChunksRef.current, { type: finalMime });
        setAudioBlob(blob);
        setAudioMimeType(finalMime);
        setRecordingState('stopped');
        // Stop the stream + audio context; they are no longer needed.
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        analyserRef.current = null;
        if (levelTimerRef.current !== null) {
          window.clearInterval(levelTimerRef.current);
          levelTimerRef.current = null;
        }
        setAudioLevel(0);
      };

      // Wire up the level meter via Web Audio AnalyserNode.
      try {
        const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (Ctor) {
          const ctx = new Ctor();
          audioContextRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          analyserRef.current = analyser;
          const data = new Uint8Array(analyser.frequencyBinCount);
          levelTimerRef.current = window.setInterval(() => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteTimeDomainData(data);
            let sumSq = 0;
            for (let i = 0; i < data.length; i++) {
              const v = (data[i] - 128) / 128;
              sumSq += v * v;
            }
            const rms = Math.sqrt(sumSq / data.length);
            setAudioLevel(Math.min(1, rms * 2.5));
          }, 100);
        }
      } catch {
        // Level meter is a nice-to-have; don't block the recording if it fails.
      }

      recorder.start(1000); // emit a chunk every 1s for crash recovery
      setElapsed(0);
      const startedAt = Date.now();
      elapsedTimerRef.current = window.setInterval(() => {
        setElapsed((Date.now() - startedAt) / 1000);
      }, 250);
      setRecordingState('recording');
    } catch (e: any) {
      setRecordingState('error');
      const msg = e?.message || String(e);
      const lower = msg.toLowerCase();
      if (lower.includes('permission') || lower.includes('denied') || lower.includes('notallowed')) {
        setRecordingError(language === 'zh'
          ? '麦克风权限被拒绝。请在系统设置中允许 dailyflow 访问麦克风, 然后重试.'
          : 'Microphone permission denied. Allow microphone access for dailyflow in System Settings, then retry.');
      } else {
        setRecordingError(msg);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  const discardRecording = () => {
    setAudioBlob(null);
    setAudioMimeType('');
    setElapsed(0);
    setRecordingState('idle');
    setRecordingError('');
    recordedChunksRef.current = [];
  };

  // --- Transcribe + organize ---

  const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // FileReader.readAsDataURL returns "data:audio/webm;base64,XXXX"
      // Keep the data: prefix — the server strips it before decoding.
      resolve(result);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });

  const runTranscribe = async () => {
    setError('');
    if (inputMode === 'paste') {
      if (!transcript.trim()) {
        setError(language === 'zh' ? '请先粘贴会议转录文本' : 'Paste a transcript first.');
        return;
      }
      try {
        const result = await meetingsApi.transcribe({
          text: transcript,
          date: nowDateStr(),
          participants,
        });
        setSegments(result.segments);
        setTranscriptionModeEcho(result.transcriptionMode || 'mock');
        setRecordingPathEcho(result.recordingPath || '');
        setStep('organize');
      } catch (e: any) {
        console.error('Transcribe failed:', e);
        setError(e?.message || String(e));
      }
      return;
    }

    // Record mode: need a finalized audio blob
    if (!audioBlob) {
      setError(language === 'zh' ? '请先录制一段音频' : 'Record some audio first.');
      return;
    }

    // Try to forward to a real Whisper API when an AI provider is configured.
    const cfg = getActiveAiConfigShared();
    setStep('organize');
    try {
      const dataUrl = await blobToBase64(audioBlob);
      const result = await meetingsApi.transcribeAudio({
        audio: { data: dataUrl, mimeType: audioMimeType || 'audio/webm' },
        date: nowDateStr(),
        participants,
        whisperConfig: cfg ? {
          apiKey: cfg.apiKey,
          baseUrl: cfg.baseUrl,
          model: 'whisper-1',
          language: language === 'zh' ? 'zh' : 'en',
        } : undefined,
        language,
      });
      setSegments(result.segments);
      setTranscriptionModeEcho(result.transcriptionMode || (cfg ? 'whisper' : 'mock-with-audio'));
      setRecordingPathEcho(result.recordingPath || '');
    } catch (e: any) {
      console.error('Audio transcribe failed:', e);
      const raw = e?.message || String(e);
      setError(getFriendlyAiErrorMessage(raw, language, 'Whisper'));
      setStep('input');
    }
  };

  const runOrganize = async () => {
    const cfg = getActiveAiConfigShared();
    if (!cfg || !cfg.apiKey || !cfg.baseUrl) {
      setError(language === 'zh'
        ? 'AI 未配置，请在「模型 & Skills」配置 API Key 后再整理。'
        : 'AI not configured. Add an API key in "Models & Skills" first.');
      return;
    }
    setError('');
    setStep('organize');
    try {
      // Prefer the re-usable extract-actions path for the action-item list so
      // the user can re-run it after editing the Markdown without re-asking
      // the LLM to also re-summarize. The summary itself still comes from
      // /api/meetings/summarize so the note + actions stay aligned.
      const result = await meetingsApi.summarize({
        apiKey: cfg.apiKey,
        model: cfg.model,
        baseUrl: cfg.baseUrl,
        transcript,
        segments,
        title: title.trim() || (language === 'zh' ? '未命名会议' : 'Untitled meeting'),
        participants,
        date: nowDateStr(),
        time: nowTimeStr(),
        language,
      });
      setMarkdown(result.markdown);
      setActionItems(result.actionItems);
      // Default: pick all action items so user has to opt out, not opt in.
      setPickedItems(new Set(result.actionItems.map((_, i) => i)));
      setStep('review');
    } catch (e: any) {
      console.error('Organize failed:', e);
      const raw = e?.message || String(e);
      setError(getFriendlyAiErrorMessage(raw, language, 'AI'));
      setStep('input');
    }
  };

  const reExtractActions = async () => {
    const cfg = getActiveAiConfigShared();
    if (!cfg || !cfg.apiKey || !cfg.baseUrl) {
      setError(language === 'zh'
        ? 'AI 未配置，请在「模型 & Skills」配置 API Key 后重试。'
        : 'AI not configured. Add an API key in "Models & Skills" first.');
      return;
    }
    if (!markdown.trim()) {
      setError(language === 'zh' ? '请先有 Markdown 内容再抽取 action items' : 'Need Markdown content to extract actions.');
      return;
    }
    setError('');
    try {
      const result = await meetingsApi.extractActions({
        apiKey: cfg.apiKey,
        model: cfg.model,
        baseUrl: cfg.baseUrl,
        markdown,
        language,
      });
      setActionItems(result.actionItems);
      setPickedItems(new Set(result.actionItems.map((_, i) => i)));
    } catch (e: any) {
      console.error('Re-extract actions failed:', e);
      const raw = e?.message || String(e);
      setError(getFriendlyAiErrorMessage(raw, language, 'AI'));
    }
  };

  const togglePick = (idx: number) => {
    setPickedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError(language === 'zh' ? '请填写会议标题' : 'Meeting title is required.');
      return;
    }
    setError('');
    setStep('saving');
    try {
      const today = nowDateStr();
      const note = await notesApi.create({
        title: title.trim(),
        body: markdown,
        type: 'meeting_note',
        date: today,
        time: nowTimeStr(),
        context: activeContext,
        tags: ['meeting'],
        linkedTaskIds: [],
        linkedProjectIds: [],
        participants: participants.length ? participants : undefined,
      });

      // Create the picked action items as today's tasks. Best-effort: a single
      // task failure should not roll back the saved note. Each task carries
      // a `#meeting-link:{note-id}` tag so Notes / Today can round-trip back
      // to the source meeting.
      const picked = actionItems.filter((_, i) => pickedItems.has(i));
      for (const item of picked) {
        try {
          await tasksApi.create(today, {
            title: item.title,
            tags: ['meeting-link', `meeting:${note.id.slice(0, 8)}`, activeContext],
            priority: item.priority || 'medium',
          });
        } catch (taskErr) {
          console.warn('Failed to create action item task:', taskErr);
        }
      }

      showToast(
        language === 'zh'
          ? `会议已保存${picked.length ? `，已加 ${picked.length} 个 task 到今天` : ''}`
          : `Meeting saved${picked.length ? `, ${picked.length} task${picked.length > 1 ? 's' : ''} added to today` : ''}`,
        'success'
      );
      onSaved?.();
      onClose();
    } catch (e: any) {
      console.error('Save failed:', e);
      setError(e?.message || String(e));
      setStep('review');
    }
  };

  const stepLabel = (s: Step): string => {
    if (language === 'zh') {
      return s === 'input' ? '1/4 录入' : s === 'record' ? '1/4 录制' : s === 'organize' ? '2/4 转录 + 整理…' : s === 'review' ? '3/4 复核' : '保存中…';
    }
    return s === 'input' ? '1/4 Input' : s === 'record' ? '1/4 Record' : s === 'organize' ? '2/4 Transcribe + Organize…' : s === 'review' ? '3/4 Review' : 'Saving…';
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          className="flex max-h-[88dvh] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-background shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-surface-white">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-accent/10 text-accent flex items-center justify-center">
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-text-heading">
                  {language === 'zh' ? '会议 Capture' : 'Meeting Capture'}
                </h3>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {stepLabel(step)} · {language === 'zh' ? 'Granola Phase 2 (真实音频 + AI 整理)' : 'Granola Phase 2 (real audio + AI organize)'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={recordingState === 'recording'}
              className="p-1.5 text-text-muted hover:text-red-500 transition-colors rounded hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
            {error && (
              <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 whitespace-pre-line">
                {error}
              </div>
            )}

            {step === 'input' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-text-muted mb-1.5">
                    {language === 'zh' ? '会议标题' : 'Meeting title'}
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={language === 'zh' ? '例：Q3 GTM sync' : 'e.g. Q3 GTM sync'}
                    className="w-full px-3 py-2 text-sm border border-border rounded bg-surface-white focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-text-muted mb-1.5">
                    <Users className="w-3 h-3 inline mr-1" />
                    {language === 'zh' ? '参会人 (逗号分隔)' : 'Participants (comma-separated)'}
                  </label>
                  <input
                    value={participantsText}
                    onChange={e => setParticipantsText(e.target.value)}
                    placeholder={language === 'zh' ? '例：Alex, Sam, Jess' : 'e.g. Alex, Sam, Jess'}
                    className="w-full px-3 py-2 text-sm border border-border rounded bg-surface-white focus:outline-none focus:border-accent"
                  />
                </div>

                {/* Mode tabs: paste (Phase 1) vs record (Phase 2) */}
                <div>
                  <div className="flex items-center gap-1 border-b border-border mb-2">
                    {([
                      { value: 'paste', label: language === 'zh' ? '粘贴转录' : 'Paste transcript', icon: ClipboardPaste },
                      { value: 'record', label: language === 'zh' ? '录制音频' : 'Record audio', icon: Mic },
                    ] as { value: InputMode; label: string; icon: typeof ClipboardPaste }[]).map(t => {
                      const Icon = t.icon;
                      const active = inputMode === t.value;
                      return (
                        <button
                          key={t.value}
                          onClick={() => {
                            if (recordingState === 'recording') return;
                            setInputMode(t.value);
                            setError('');
                            if (t.value === 'record') {
                              setStep('record');
                            } else {
                              setStep('input');
                            }
                          }}
                          disabled={recordingState === 'recording'}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border-b-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            active
                              ? 'border-accent text-accent'
                              : 'border-transparent text-text-muted hover:text-text-heading'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {inputMode === 'paste' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-text-muted mb-1.5">
                        <FileText className="w-3 h-3 inline mr-1" />
                        {language === 'zh' ? '会议转录 (粘贴纯文本)' : 'Transcript (paste plain text)'}
                        <span className="text-red-500 ml-1">*</span>
                      </label>
                      <textarea
                        value={transcript}
                        onChange={e => setTranscript(e.target.value)}
                        rows={10}
                        placeholder={language === 'zh'
                          ? 'Alex: 我们 Q3 主推 ICP 改成 PLG?\nSam: 我觉得 enterprise 还是大头。\n…'
                          : 'Alex: Should we push PLG as Q3 ICP?\nSam: I think enterprise is still the majority.\n…'}
                        className="w-full px-3 py-2 text-sm border border-border rounded bg-surface-white focus:outline-none focus:border-accent resize-y font-mono"
                      />
                      <p className="text-[10px] text-text-muted mt-1">
                        {language === 'zh'
                          ? '提示: 「Name: 说话」格式会被自动识别为不同 speaker。'
                          : 'Tip: Lines starting with "Name: " are detected as different speakers.'}
                      </p>
                    </div>
                  </>
                )}

                {inputMode === 'record' && (
                  <>
                    <div className="rounded-lg border border-border bg-surface-white p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {recordingState === 'recording' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600">
                              <Circle className="w-2.5 h-2.5 fill-red-600 text-red-600 animate-pulse" />
                              {language === 'zh' ? '正在录制' : 'Recording'}
                            </span>
                          ) : recordingState === 'requesting' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              {language === 'zh' ? '请求麦克风权限…' : 'Requesting mic…'}
                            </span>
                          ) : recordingState === 'stopped' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-accent">
                              <Check className="w-3 h-3" />
                              {language === 'zh' ? `已录制 ${formatDuration(elapsed)}` : `Recorded ${formatDuration(elapsed)}`}
                            </span>
                          ) : recordingState === 'error' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600">
                              <AlertTriangle className="w-3 h-3" />
                              {language === 'zh' ? '麦克风错误' : 'Mic error'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted">
                              {language === 'zh' ? '点击开始录制' : 'Click to start recording'}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-mono text-text-muted">
                          {formatDuration(elapsed)}
                        </div>
                      </div>

                      {/* Level meter */}
                      {recordingState === 'recording' && (
                        <div className="h-1.5 rounded bg-surface overflow-hidden">
                          <div
                            className="h-full bg-red-500 transition-all"
                            style={{ width: `${Math.max(4, audioLevel * 100)}%` }}
                          />
                        </div>
                      )}

                      {recordingError && (
                        <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 whitespace-pre-line">
                          {recordingError}
                        </div>
                      )}

                      {audioBlob && recordingState === 'stopped' && (
                        <audio
                          controls
                          src={URL.createObjectURL(audioBlob)}
                          className="w-full h-9"
                        />
                      )}

                      <div className="flex items-center gap-2">
                        {(recordingState === 'idle' || recordingState === 'error') && (
                          <button
                            onClick={startRecording}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                          >
                            <Circle className="w-3 h-3 fill-white" />
                            {language === 'zh' ? '开始录制' : 'Start'}
                          </button>
                        )}
                        {recordingState === 'recording' && (
                          <button
                            onClick={stopRecording}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                          >
                            <Square className="w-3 h-3 fill-white" />
                            {language === 'zh' ? '停止' : 'Stop'}
                          </button>
                        )}
                        {recordingState === 'stopped' && (
                          <button
                            onClick={discardRecording}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-border text-text-muted hover:text-red-500 rounded transition-colors"
                          >
                            <X className="w-3 h-3" />
                            {language === 'zh' ? '重新录制' : 'Re-record'}
                          </button>
                        )}
                      </div>

                      <p className="text-[10px] text-text-muted leading-relaxed">
                        {language === 'zh'
                          ? '音频会保存到 ~/.dailyflow/recordings/{date}/{uuid}.webm. 配 Whisper API 时会发到云端转录; 不配也保留 raw audio 供后续重试.'
                          : 'Audio is saved to ~/.dailyflow/recordings/{date}/{uuid}.webm. With a Whisper API configured, it is forwarded for real transcription; otherwise the raw audio is kept for later retry.'}
                      </p>
                    </div>
                  </>
                )}
              </>
            )}

            {step === 'record' && (
              <div className="space-y-4">
                <p className="text-xs text-text-muted">
                  {language === 'zh' ? '录制一段麦克风音频, 然后转录 + AI 整理.' : 'Record some mic audio, then transcribe + AI organize.'}
                </p>
                <div className="rounded-lg border border-border bg-surface-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {recordingState === 'recording' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600">
                          <Circle className="w-2.5 h-2.5 fill-red-600 text-red-600 animate-pulse" />
                          {language === 'zh' ? '正在录制' : 'Recording'}
                        </span>
                      ) : recordingState === 'stopped' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-accent">
                          <Check className="w-3 h-3" />
                          {language === 'zh' ? `已录制 ${formatDuration(elapsed)}` : `Recorded ${formatDuration(elapsed)}`}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted">
                          {language === 'zh' ? '点击开始录制' : 'Click to start recording'}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-mono text-text-muted">{formatDuration(elapsed)}</div>
                  </div>
                  {recordingState === 'recording' && (
                    <div className="h-1.5 rounded bg-surface overflow-hidden">
                      <div
                        className="h-full bg-red-500 transition-all"
                        style={{ width: `${Math.max(4, audioLevel * 100)}%` }}
                      />
                    </div>
                  )}
                  {recordingError && (
                    <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 whitespace-pre-line">
                      {recordingError}
                    </div>
                  )}
                  {audioBlob && recordingState === 'stopped' && (
                    <audio controls src={URL.createObjectURL(audioBlob)} className="w-full h-9" />
                  )}
                  <div className="flex items-center gap-2">
                    {(recordingState === 'idle' || recordingState === 'error') && (
                      <button
                        onClick={startRecording}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                      >
                        <Circle className="w-3 h-3 fill-white" />
                        {language === 'zh' ? '开始录制' : 'Start'}
                      </button>
                    )}
                    {recordingState === 'recording' && (
                      <button
                        onClick={stopRecording}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                      >
                        <Square className="w-3 h-3 fill-white" />
                        {language === 'zh' ? '停止' : 'Stop'}
                      </button>
                    )}
                    {recordingState === 'stopped' && (
                      <button
                        onClick={discardRecording}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-border text-text-muted hover:text-red-500 rounded transition-colors"
                      >
                        <X className="w-3 h-3" />
                        {language === 'zh' ? '重新录制' : 'Re-record'}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        stopAllRecording();
                        setInputMode('paste');
                        setStep('input');
                      }}
                      disabled={recordingState === 'recording'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-text-muted hover:text-text-heading transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {language === 'zh' ? '返回' : 'Back'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 'organize' && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
                <p className="text-sm text-text-muted">
                  {inputMode === 'record'
                    ? (language === 'zh' ? '正在上传音频 + 转录 + AI 整理会议纪要…' : 'Uploading audio + transcribing + AI organizing…')
                    : (language === 'zh' ? '正在让 AI 整理会议纪要 + 提取 action items…' : 'AI is organizing the note + extracting action items…')}
                </p>
                {segments.length > 0 && (
                  <p className="text-[11px] text-text-muted">
                    {language === 'zh' ? `${segments.length} 段已就绪` : `${segments.length} segments ready`}
                  </p>
                )}
                {transcriptionModeEcho && (
                  <p className="text-[10px] text-text-muted/70">
                    {language === 'zh' ? '转录方式: ' : 'Mode: '}
                    {transcriptionModeEcho}
                    {recordingPathEcho ? ` · ${recordingPathEcho}` : ''}
                  </p>
                )}
              </div>
            )}

            {(step === 'review' || step === 'saving') && (
              <>
                <div>
                  <label className="block text-xs font-bold text-text-muted mb-1.5">
                    {language === 'zh' ? '会议纪要 (Markdown)' : 'Meeting note (Markdown)'}
                  </label>
                  <textarea
                    value={markdown}
                    onChange={e => setMarkdown(e.target.value)}
                    disabled={step === 'saving'}
                    rows={12}
                    className="w-full px-3 py-2 text-sm border border-border rounded bg-surface-white focus:outline-none focus:border-accent resize-y font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ListChecks className="w-3.5 h-3.5 text-accent" />
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                      {language === 'zh' ? `Review N Action Items (勾选要加入今天的, 共 ${actionItems.length})` : `Review N Action Items (pick which to add to today, ${actionItems.length} total)`}
                    </span>
                    <span className="h-px bg-border flex-1" />
                    <button
                      onClick={reExtractActions}
                      disabled={step === 'saving'}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold border border-border rounded hover:border-accent/40 hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={language === 'zh' ? '重新抽取 action items' : 'Re-extract action items'}
                    >
                      <Sparkles className="w-3 h-3" />
                      {language === 'zh' ? '重抽' : 'Re-extract'}
                    </button>
                  </div>
                  {actionItems.length === 0 ? (
                    <div className="text-xs text-text-muted italic px-2 py-3">
                      {language === 'zh' ? '未提取到 action items。' : 'No action items extracted.'}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {actionItems.map((item, i) => {
                        const picked = pickedItems.has(i);
                        return (
                          <button
                            key={i}
                            onClick={() => togglePick(i)}
                            disabled={step === 'saving'}
                            className={`w-full flex items-start gap-2 px-3 py-2 text-left border-2 rounded-lg transition-all ${
                              picked
                                ? 'border-accent bg-accent/10'
                                : 'border-border hover:border-accent/40 bg-surface-white'
                            }`}
                          >
                            <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                              picked ? 'bg-accent text-white' : 'border-2 border-border'
                            }`}>
                              {picked && <Check className="w-3 h-3" strokeWidth={3} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-text-heading">{item.title}</div>
                              {(item.owner || item.due) && (
                                <div className="text-[10px] text-text-muted mt-0.5">
                                  {item.owner && <span>{item.owner}</span>}
                                  {item.owner && item.due && <span> · </span>}
                                  {item.due && <span>{item.due}</span>}
                                </div>
                              )}
                            </div>
                            {item.priority && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                item.priority === 'high'
                                  ? 'bg-red-100 text-red-700'
                                  : item.priority === 'low'
                                  ? 'bg-stone-100 text-stone-600'
                                  : 'bg-amber-100 text-amber-700'
                              }`}>
                                {item.priority}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-surface-white">
            <div className="text-xs text-text-muted flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              <span>{nowDateStr()} · {nowTimeStr()}</span>
              {transcriptionModeEcho && (
                <span className="ml-2 text-text-muted/70">
                  · {transcriptionModeEcho}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={step === 'saving' || recordingState === 'recording'}
                className="px-3 py-1.5 text-xs font-bold text-text-muted hover:text-text-heading transition-colors disabled:opacity-50"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              {step === 'input' && inputMode === 'paste' && (
                <button
                  onClick={runTranscribe}
                  disabled={!transcript.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-accent text-accent rounded hover:bg-accent/10 transition-colors disabled:opacity-50"
                >
                  <FileText className="w-3 h-3" />
                  {language === 'zh' ? '转录 (mock)' : 'Transcribe (mock)'}
                </button>
              )}
              {step === 'record' && recordingState === 'stopped' && (
                <button
                  onClick={runTranscribe}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  {language === 'zh' ? '转录 + 整理' : 'Transcribe + Organize'}
                </button>
              )}
              {step === 'input' && inputMode === 'record' && (
                <button
                  onClick={() => setStep('record')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors"
                >
                  <Mic className="w-3 h-3" />
                  {language === 'zh' ? '去录制' : 'Record'}
                </button>
              )}
              {step === 'organize' && (
                <button
                  disabled
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded opacity-50"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {language === 'zh' ? '处理中…' : 'Working…'}
                </button>
              )}
              {step === 'review' && (
                <button
                  onClick={runOrganize}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-accent text-accent rounded hover:bg-accent/10 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  {language === 'zh' ? '重新整理' : 'Re-organize'}
                </button>
              )}
              {step === 'review' && (
                <button
                  onClick={handleSave}
                  disabled={!title.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-3 h-3" />
                  {language === 'zh' ? '保存会议笔记' : 'Save meeting note'}
                </button>
              )}
              {step === 'saving' && (
                <button
                  disabled
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded opacity-50"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {language === 'zh' ? '保存中…' : 'Saving…'}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
