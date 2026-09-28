/** Local ASR model manager — list, download, and observe progress.
 *
 * Pairs with the server-side `localModelsService` and exposes:
 *  - `useLocalAsrModels()` — fetches the catalogue + installed models.
 *  - `useDownloadLocalModel()` — kicks off a download.
 *  - `useSystemCheck()` — probes the host's `whisper-cli` + `ffmpeg`.
 *  - `useLocalModelEvents()` — bridges the SSE progress stream into React state.
 *  - `useTtsProviders()` + `useSynthesizeSpeech()` — TTS surfaces.
 *
 * Self-managed with `useEffect` + `useState` so the components don't have
 * to sit inside a `QueryClientProvider` (the tests for the meeting panel
 * render in isolation). Switching to react-query would buy us cache
 * invalidation across pages; today the only consumer is the meeting
 * panel, so the trade-off isn't worth the test-friction.
 */
import { useCallback, useEffect, useState } from 'react';
import { transcriptionApi, type TtsProviderInfo, ttsApi, type TtsRequestInput, type TtsResult } from '../../../api/client';

export interface LocalModelCatalogEntry {
  id: string;
  label: string;
  filename: string;
  approxSizeMb: number;
  bestFor: string[];
  mirrors: string[];
}

export interface LocalModelInstalled {
  id: string;
  filename: string;
  path: string;
  sizeBytes: number;
  installedAt: string;
}

export interface LocalModelsPayload {
  catalog: LocalModelCatalogEntry[];
  installed: LocalModelInstalled[];
  directory: string;
}

export interface SystemCheckPayload {
  platform: 'macos' | 'linux' | 'windows' | 'unknown';
  whisperCliPath: string | null;
  ffmpegPath: string | null;
  ready: boolean;
  installCommand: { label: string; command: string } | null;
}

export interface ModelDownloadProgress {
  modelId: string;
  state: 'started' | 'progress' | 'completed' | 'failed';
  percent?: number;
  bytes?: number;
  totalBytes?: number;
  path?: string;
  error?: string;
}

export interface UseQueryState<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useLocalAsrModels(): UseQueryState<LocalModelsPayload> {
  const [data, setData] = useState<LocalModelsPayload | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    transcriptionApi.listLocalModels()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [tick]);

  return { data, isLoading, error, refetch };
}

export interface UseDownloadState {
  mutate: (modelId: string) => Promise<{ result: { modelId: string; path: string; bytes: number } }>;
  isPending: boolean;
  variables: string | null;
  error: Error | null;
}

export function useDownloadLocalModel(onSuccess?: () => void): UseDownloadState {
  const [isPending, setIsPending] = useState(false);
  const [variables, setVariables] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const mutate = useCallback(async (modelId: string) => {
    setIsPending(true);
    setVariables(modelId);
    setError(null);
    try {
      const result = await transcriptionApi.downloadLocalModel(modelId);
      onSuccess?.();
      return result;
    } catch (cause) {
      const err = cause instanceof Error ? cause : new Error(String(cause));
      setError(err);
      throw err;
    } finally {
      setIsPending(false);
      setVariables(null);
    }
  }, [onSuccess]);
  return { mutate, isPending, variables, error };
}

export function useSystemCheck(): UseQueryState<SystemCheckPayload> {
  const [data, setData] = useState<SystemCheckPayload | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    transcriptionApi.systemCheck()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [tick]);
  return { data, isLoading, error, refetch };
}

export function useLocalModelEvents(): {
  events: Record<string, ModelDownloadProgress>;
  clear: () => void;
} {
  const [events, setEvents] = useState<Record<string, ModelDownloadProgress>>({});
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = transcriptionApi.openLocalModelEvents();
    const handle = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as ModelDownloadProgress;
        setEvents((current) => ({ ...current, [payload.modelId]: payload }));
      } catch {
        // ignore malformed events
      }
    };
    source.addEventListener('started', handle);
    source.addEventListener('progress', handle);
    source.addEventListener('completed', handle);
    source.addEventListener('failed', handle);
    return () => {
      source.close();
    };
  }, []);
  return {
    events,
    clear: () => setEvents({}),
  };
}

export interface UseTtsProvidersState {
  providers: TtsProviderInfo[];
  isLoading: boolean;
  error: Error | null;
}

export function useTtsProviders(): UseTtsProvidersState {
  const [providers, setProviders] = useState<TtsProviderInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    ttsApi.listProviders()
      .then((result) => {
        if (cancelled) return;
        setProviders(result.providers);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);
  return { providers, isLoading, error };
}

export interface UseSynthesizeState {
  mutate: (input: TtsRequestInput) => Promise<TtsResult>;
  isPending: boolean;
  error: Error | null;
}

export function useSynthesizeSpeech(): UseSynthesizeState {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mutate = useCallback(async (input: TtsRequestInput) => {
    setIsPending(true);
    setError(null);
    try {
      return await ttsApi.synthesize(input);
    } catch (cause) {
      const err = cause instanceof Error ? cause : new Error(String(cause));
      setError(err);
      throw err;
    } finally {
      setIsPending(false);
    }
  }, []);
  return { mutate, isPending, error };
}

export interface ApplyModelInput {
  /** Absolute path to the downloaded ggml-* file. */
  modelPath: string;
  /** Optional override for the whisper-cli binary; defaults to `whisper-cli` (PATH). */
  executablePath?: string;
  /** Optional override for ffmpeg; defaults to `ffmpeg` (PATH). */
  ffmpegPath?: string;
  /** 'auto' / 'zh' / 'en' — passed through to whisper.cpp via -l. */
  language?: string;
}

export interface ApplyModelResult {
  config: Parameters<typeof transcriptionApi.setLocalConfig>[0];
  status: { executable: boolean; model: boolean; ffmpeg: boolean };
}

export interface UseApplyModelState {
  mutate: (input: ApplyModelInput) => Promise<ApplyModelResult>;
  isPending: boolean;
  error: Error | null;
}

/**
 * Wire a downloaded model into the server-side local-transcription config.
 * The previous flow expected the user to type three paths into the
 * settings panel after every download — calling this hook from
 * LocalModelsPanel means the moment a download finishes the model is
 * immediately usable for the next recording.
 */
export function useApplyDownloadedModel(): UseApplyModelState {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mutate = useCallback(async (input: ApplyModelInput): Promise<ApplyModelResult> => {
    setIsPending(true);
    setError(null);
    try {
      const config = {
        executablePath: input.executablePath ?? 'whisper-cli',
        modelPath: input.modelPath,
        ffmpegPath: input.ffmpegPath ?? 'ffmpeg',
        language: input.language ?? 'auto',
        extraArgs: [],
      };
      const result = await transcriptionApi.setLocalConfig(config);
      return { config: result.config, status: result.status };
    } catch (cause) {
      const err = cause instanceof Error ? cause : new Error(String(cause));
      setError(err);
      throw err;
    } finally {
      setIsPending(false);
    }
  }, []);
  return { mutate, isPending, error };
}