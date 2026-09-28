/** Tests for the browser-side TTS hook + the LocalModelsPanel.
 *  SSR-safe: when `speechSynthesis` is undefined (jsdom by default), the
 *  hook must still expose a sane surface area with `isSupported=false`. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useBrowserTts } from '../hooks/useBrowserTts';
import { LocalModelsPanel } from './LocalModelsPanel';

class FakeUtterance {
  lang = '';
  voice: unknown = null;
  rate = 1;
  pitch = 1;
  text = '';
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

/** Lightweight test for the LocalModelsPanel component itself. We mock the
 *  React hook surface (`../hooks/useLocalAsrModels`) so we don't have to
 *  spin up an HTTP server. The hook contract is exercised by the
 *  `useBrowserTts` tests above. */
// (imports hoisted to the top of the file)

const apiMocks = vi.hoisted(() => ({
  listLocalModels: vi.fn(),
  listLocalModelsCatalog: [] as Array<{ id: string; label: string; filename: string; approxSizeMb: number; bestFor: string[]; mirrors: string[] }>,
  listLocalModelsInstalled: [] as Array<{ id: string; filename: string; path: string; sizeBytes: number; installedAt: string }>,
  listLocalModelsDirectory: '/tmp/df-models',
  downloadLocalModel: vi.fn(),
  applyDownloadedModel: vi.fn(),
  systemCheckPayload: null as null | { platform: 'macos' | 'linux' | 'windows' | 'unknown'; whisperCliPath: string | null; ffmpegPath: string | null; ready: boolean; installCommand: { label: string; command: string } | null },
  systemCheckError: null as Error | null,
  openLocalModelEvents: vi.fn(),
}));

vi.mock('../hooks/useLocalAsrModels', () => ({
  useLocalAsrModels: () => ({
    data: {
      catalog: apiMocks.listLocalModelsCatalog,
      installed: apiMocks.listLocalModelsInstalled,
      directory: apiMocks.listLocalModelsDirectory,
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useDownloadLocalModel: () => ({
    mutate: apiMocks.downloadLocalModel,
    isPending: false,
    variables: null,
    error: null,
  }),
  useApplyDownloadedModel: () => ({
    mutate: apiMocks.applyDownloadedModel,
    isPending: false,
    error: null,
  }),
  useSystemCheck: () => ({
    data: apiMocks.systemCheckError ? undefined : apiMocks.systemCheckPayload,
    isLoading: false,
    error: apiMocks.systemCheckError,
    refetch: vi.fn(),
  }),
  useLocalModelEvents: () => ({
    events: {},
    clear: vi.fn(),
  }),
}));

// EventSource is referenced by the SSE hook at module-import time — make
// sure the panel can be rendered in jsdom without throwing.
if (typeof EventSource === 'undefined') {
  // @ts-expect-error jsdom shim
  globalThis.EventSource = class FakeEventSource {
    constructor() {}
    addEventListener() {}
    close() {}
  };
}

describe('useBrowserTts', () => {
  const originalSpeechSynthesis = (window as { speechSynthesis?: unknown }).speechSynthesis;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalSpeechSynthesis === undefined) {
      delete (window as { speechSynthesis?: unknown }).speechSynthesis;
    } else {
      (window as { speechSynthesis?: unknown }).speechSynthesis = originalSpeechSynthesis;
    }
  });

  it('reports isSupported=false when speechSynthesis is missing', () => {
    delete (window as { speechSynthesis?: unknown }).speechSynthesis;
    const { result } = renderHook(() => useBrowserTts());
    expect(result.current.isSupported).toBe(false);
    // speak/stop should be safe no-ops even without the API.
    act(() => result.current.speak('hello'));
    act(() => result.current.stop());
    expect(result.current.isSpeaking).toBe(false);
  });

  it('builds a SpeechSynthesisUtterance and reflects speaking state', () => {
    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    const instances: FakeUtterance[] = [];
    (window as { speechSynthesis?: unknown }).speechSynthesis = {
      speak: speakMock,
      cancel: cancelMock,
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: () => [
        { name: 'Tingting', lang: 'zh-CN' },
        { name: 'Alex', lang: 'en-US' },
      ],
    };
    (window as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = function Trackable(text: string) {
      const utter = new FakeUtterance(text);
  instances.push(utter);
  return utter;
} as unknown as typeof SpeechSynthesisUtterance;

    const { result } = renderHook(() => useBrowserTts({ language: 'zh' }));
    act(() => result.current.speak('你好世界'));

    expect(speakMock).toHaveBeenCalledTimes(1);
    const utter = instances[0];
    expect(utter.text).toBe('你好世界');
    // Hook sets these after construction — read them off the instance now.
    expect(utter.lang).toBe('zh-CN');
    expect((utter.voice as { name: string } | null)?.name).toBe('Tingting');

    // Cancel is called before speak so a rapid double-click doesn't queue.
    expect(cancelMock).toHaveBeenCalled();

    // Synthesize an onend to flip the speaking flag back to false.
    act(() => utter.onend?.());
    expect(result.current.isSpeaking).toBe(false);
  });

  it('picks the preferred voice when supplied', () => {
    const speakMock = vi.fn();
    const instances: FakeUtterance[] = [];
    (window as { speechSynthesis?: unknown }).speechSynthesis = {
      speak: speakMock,
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: () => [
        { name: 'Tingting', lang: 'zh-CN' },
        { name: 'Alex', lang: 'en-US' },
      ],
    };
    (window as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = function Trackable(text: string) {
      const utter = new FakeUtterance(text);
  instances.push(utter);
  return utter;
} as unknown as typeof SpeechSynthesisUtterance;

    const { result } = renderHook(() => useBrowserTts({ language: 'en', preferredVoiceName: 'Alex' }));
    act(() => result.current.speak('hi'));
    expect((instances[0]?.voice as { name: string } | null)?.name).toBe('Alex');
    expect(result.current.isSpeaking).toBe(true);
  });

  it('stays in sync across two mounted instances sharing the same speechSynthesis', () => {
    // Two NoteEditor instances rendering at the same time (e.g. split
    // layout, or a quick view switch) used to desync because each
    // instance tracked speechSynthesis state in isolation. The hook now
    // broadcasts a custom DOM event so a stop from one flips the other
    // back to idle too.
    let lastUtter: { onend: (() => void) | null } | null = null;
    class SyncUtterance {
      lang = '';
      voice: unknown = null;
      rate = 1;
      pitch = 1;
      text = '';
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public body: string) { lastUtter = this; }
    }
    (window as { speechSynthesis?: unknown }).speechSynthesis = {
      speak: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: () => [{ name: 'Tingting', lang: 'zh-CN' }],
    };
    (window as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = SyncUtterance as unknown as typeof SpeechSynthesisUtterance;

    const editorA = renderHook(() => useBrowserTts({ language: 'zh' }));
    const editorB = renderHook(() => useBrowserTts({ language: 'zh' }));
    act(() => editorA.result.current.speak('A starts speaking'));

    expect(editorA.result.current.isSpeaking).toBe(true);
    expect(editorB.result.current.isSpeaking).toBe(false);

    // Editor B clicks Stop — even though A owns the utterance, B's
    // broadcast should reset A's local state too.
    act(() => editorB.result.current.stop());
    expect(editorB.result.current.isSpeaking).toBe(false);
    expect(editorA.result.current.isSpeaking).toBe(false);

    // Same goes for natural end events.
    editorA.unmount();
    editorB.unmount();
    act(() => lastUtter?.onend?.());
    // We just assert no throw — the broadcast fires against an unmounted
    // listener and that's fine.
  });

  it('does not flip back to idle when a superseded utterance errors out', () => {
    // Regression: clicking Read aloud twice quickly cancels utterance #1 and
    // starts #2. The cancel fires #1's `onerror` asynchronously; the owner id
    // is unchanged (same instance), so an owner-only guard let that stale
    // error mark the *still playing* second utterance as finished, leaving
    // the button stuck on "Play" while audio kept coming out.
    const instances: FakeUtterance[] = [];
    (window as { speechSynthesis?: unknown }).speechSynthesis = {
      speak: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: () => [{ name: 'Tingting', lang: 'zh-CN' }],
      speaking: false,
      pending: false,
      paused: false,
    };
    (window as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = function Trackable(text: string) {
      const utter = new FakeUtterance(text);
      instances.push(utter);
      return utter;
    } as unknown as typeof SpeechSynthesisUtterance;

    const { result } = renderHook(() => useBrowserTts({ language: 'zh' }));
    act(() => result.current.speak('第一段'));
    const first = instances[0]!;
    act(() => result.current.speak('第二段'));
    expect(result.current.isSpeaking).toBe(true);

    // The cancelled first utterance reports an error after the second began.
    act(() => first.onerror?.());
    // Speech #2 is still playing — the UI must stay in the "speaking" state.
    expect(result.current.isSpeaking).toBe(true);

    // When the *live* utterance ends, the state does flip.
    act(() => instances[1]!.onend?.());
    expect(result.current.isSpeaking).toBe(false);
  });

  it('does not force an unrelated voice when no voice matches the language', () => {
    // `lang` is already set correctly on the utterance; explicitly assigning
    // an English voice object to a Chinese utterance overrides it and makes
    // the engine read Chinese with English phonemes.
    const instances: FakeUtterance[] = [];
    (window as { speechSynthesis?: unknown }).speechSynthesis = {
      speak: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      // Only an English voice is installed.
      getVoices: () => [{ name: 'Alex', lang: 'en-US' }],
      speaking: false,
      pending: false,
      paused: false,
    };
    (window as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = function Trackable(text: string) {
      const utter = new FakeUtterance(text);
      instances.push(utter);
      return utter;
    } as unknown as typeof SpeechSynthesisUtterance;

    const { result } = renderHook(() => useBrowserTts({ language: 'zh' }));
    act(() => result.current.speak('你好'));
    expect(instances[0]!.voice).toBeNull();
    expect(instances[0]!.lang).toBe('zh-CN');
  });

  it('cancels orphaned playback when audio is playing but no instance owns it', () => {
    // Simulates a page reload landing on a note while the OS engine is still
    // talking: nobody can render a stop button, so the first mount claims idle.
    const cancelMock = vi.fn();
    (window as { speechSynthesis?: unknown }).speechSynthesis = {
      speak: vi.fn(),
      cancel: cancelMock,
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: () => [{ name: 'Alex', lang: 'en-US' }],
      speaking: true,
      pending: false,
      paused: false,
    };
    (window as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = FakeUtterance as unknown as typeof SpeechSynthesisUtterance;

    renderHook(() => useBrowserTts({ language: 'en' }));
    expect(cancelMock).toHaveBeenCalled();
  });
});

describe('LocalModelsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupPayloads(overrides: Partial<{
    systemReady: boolean;
    catalog: Array<{ id: string; label: string; filename: string; approxSizeMb: number; bestFor: string[]; mirrors: string[] }>;
    installed: Array<{ id: string; filename: string; path: string; sizeBytes: number; installedAt: string }>;
    installCommand: { label: string; command: string } | null;
  }> = {}) {
    apiMocks.listLocalModelsCatalog = overrides.catalog ?? [
      { id: 'tiny', label: 'Whisper tiny', filename: 'ggml-tiny.bin', approxSizeMb: 75, bestFor: ['en'], mirrors: ['https://example/tiny'] },
      { id: 'small', label: 'Whisper small', filename: 'ggml-small.bin', approxSizeMb: 466, bestFor: ['zh', 'en'], mirrors: ['https://example/small'] },
    ];
    apiMocks.listLocalModelsInstalled = overrides.installed ?? [];
    apiMocks.listLocalModelsDirectory = '/tmp/df-models';
    apiMocks.systemCheckPayload = {
      platform: 'macos',
      whisperCliPath: overrides.systemReady ? 'whisper-cli' : null,
      ffmpegPath: overrides.systemReady ? 'ffmpeg' : null,
      ready: overrides.systemReady ?? false,
      installCommand: overrides.systemReady
        ? null
        : (overrides.installCommand ?? { label: 'Install with Homebrew', command: 'brew install whisper-cpp ffmpeg' }),
    };
  }

  it('renders the system status banner and the install command when the host is missing tools', async () => {
    setupPayloads();
    render(<LocalModelsPanel language="en" />);
    expect(await screen.findByTestId('local-models-panel')).toBeInTheDocument();
    expect(await screen.findByTestId('system-install-command')).toHaveTextContent('brew install whisper-cpp ffmpeg');
  });

  it('hides the install command when the host is ready', async () => {
    setupPayloads({ systemReady: true });
    render(<LocalModelsPanel language="en" />);
    expect(await screen.findByTestId('local-models-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('system-install-command')).not.toBeInTheDocument();
  });

  it('expands the catalog and exposes one download button per model', async () => {
    setupPayloads();
    render(<LocalModelsPanel language="en" />);
    fireEvent.click(screen.getByRole('button', { name: /Expand local models panel/ }));
    await waitFor(() => screen.getByTestId('local-model-row-tiny'));
    expect(screen.getByTestId('local-model-download-tiny')).toBeInTheDocument();
    expect(screen.getByTestId('local-model-download-small')).toBeInTheDocument();
  });

  it('calls downloadLocalModel when the user clicks the download button', async () => {
    setupPayloads();
    apiMocks.downloadLocalModel.mockResolvedValue({
      result: { modelId: 'tiny', path: '/tmp/df-models/ggml-tiny.bin', bytes: 100 },
    });
    render(<LocalModelsPanel language="en" />);
    fireEvent.click(screen.getByRole('button', { name: /Expand local models panel/ }));
    await waitFor(() => screen.getByTestId('local-model-row-tiny'));
    fireEvent.click(screen.getByTestId('local-model-download-tiny'));
    await waitFor(() => expect(apiMocks.downloadLocalModel).toHaveBeenCalledWith('tiny'));
  });

  it('marks a model as completed when it is already installed', async () => {
    setupPayloads({
      installed: [{
        id: 'small',
        filename: 'ggml-small.bin',
        path: '/tmp/df-models/ggml-small.bin',
        sizeBytes: 466_000_000,
        installedAt: new Date('2026-08-01').toISOString(),
      }],
    });
    render(<LocalModelsPanel language="en" />);
    fireEvent.click(screen.getByRole('button', { name: /Expand local models panel/ }));
    await waitFor(() => screen.getByTestId('local-model-row-small'));
    const status = screen.getByTestId('local-model-status-small');
    expect(status).toHaveAttribute('data-status', 'completed');
    // The "download" button must not exist for already-installed models.
    expect(screen.queryByTestId('local-model-download-small')).not.toBeInTheDocument();
  });

  it('uses Chinese copy when language="zh"', async () => {
    setupPayloads();
    render(<LocalModelsPanel language="zh" />);
    expect(await screen.findByText(/在 dailyflow 内一键下载/)).toBeInTheDocument();
  });

  it('surfaces a failed download request inline instead of failing silently', async () => {
    // Previously `download.error` was captured by the hook but never rendered,
    // so a blocked mirror / offline host produced no feedback at all.
    setupPayloads();
    apiMocks.downloadLocalModel.mockRejectedValue(new Error('HTTP 407 Proxy Authentication Required'));
    render(<LocalModelsPanel language="en" />);
    fireEvent.click(screen.getByRole('button', { name: /Expand local models panel/ }));
    await waitFor(() => screen.getByTestId('local-model-row-tiny'));

    fireEvent.click(screen.getByTestId('local-model-download-tiny'));

    const error = await screen.findByTestId('local-model-request-error-tiny');
    expect(error).toHaveTextContent('HTTP 407');
    expect(error).toHaveAttribute('role', 'alert');
  });

  it('explains a failed download to the user without an unhandled rejection', async () => {
    setupPayloads();
    apiMocks.downloadLocalModel.mockRejectedValue(new Error('boom'));
    render(<LocalModelsPanel language="en" />);
    fireEvent.click(screen.getByRole('button', { name: /Expand local models panel/ }));
    await waitFor(() => screen.getByTestId('local-model-row-tiny'));

    fireEvent.click(screen.getByTestId('local-model-download-tiny'));
    const cta = await screen.findByTestId('local-model-request-error-tiny');
    expect(cta).toBeInTheDocument();
    // The button stays usable so the user can retry.
    expect(screen.getByTestId('local-model-download-tiny')).toBeEnabled();
  });

  it('auto-expands the model picker once the host is ready', async () => {
    setupPayloads({ systemReady: true });
    render(<LocalModelsPanel language="en" />);
    // No click — the panel is the headline feature and must not hide behind a
    // bare "+" glyph for new users.
    expect(await screen.findByTestId('local-models-expanded')).toBeInTheDocument();
    expect(await screen.findByTestId('local-model-row-tiny')).toBeInTheDocument();
  });

  it('keeps the panel collapsed while the host still needs setup', async () => {
    setupPayloads({ systemReady: false });
    render(<LocalModelsPanel language="en" />);
    expect(await screen.findByTestId('local-models-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('local-models-expanded')).not.toBeInTheDocument();
  });

  it('does not tell an offline user to install tools they already have', async () => {
    // `systemCheck.error` means "couldn't ask the server" — a different
    // diagnosis from "the server says whisper-cli is missing". Telling an
    // offline user to `brew install ffmpeg` when they already have it is
    // actively misleading.
    setupPayloads({ systemReady: false });
    apiMocks.systemCheckError = new Error('Failed to probe system dependencies');
    render(<LocalModelsPanel language="en" />);

    const banner = await screen.findByTestId('system-check-error');
    expect(banner).toHaveTextContent(/Could not reach the server/i);
    expect(screen.queryByTestId('system-install-command')).not.toBeInTheDocument();
    expect(screen.getByTestId('system-check-retry')).toBeInTheDocument();
  });
});