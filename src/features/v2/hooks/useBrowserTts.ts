/** Browser-native text-to-speech hook for the in-product "Read aloud" button.
 *
 * Wraps `window.speechSynthesis` with a small state machine so the UI can
 * render a play/stop toggle and surface the current chunk. The hook is
 * SSR-safe: it returns the disabled initial state on the server.
 *
 * Voice selection prefers the user's saved preference (`language` + a
 * remembered voice name), falling back to the first installed voice in the
 * requested language. If `speechSynthesis` isn't available (older Safari,
 * some Linux builds) the hook still works — `speak()` becomes a no-op and
 * `isSupported` is `false`, which the UI uses to hide the button.
 *
 * Multi-instance sync: `window.speechSynthesis` is a global singleton.
 * When NoteEditor A starts speaking and NoteEditor B (e.g. the user
 * switches notes) calls `stop()`, the global cancel kills A's utterance
 * but A's per-instance state machine never hears about it. We solve this
 * by tracking the "active utterance owner" in a module-level ref, and
 * broadcasting a custom DOM event whenever the global speech state
 * changes. Every mounted instance listens for the event and reconciles
 * its own state, so any cancel/error/end event stays consistent across
 * all `useBrowserTts` consumers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface BrowserTtsOptions {
  /** 'zh' or 'en' — drives the BCP-47 language tag. */
  language?: 'zh' | 'en';
  /** Persisted voice name; loaded once from storage by the host. */
  preferredVoiceName?: string;
  /** 0..2 — defaults to 1. */
  rate?: number;
  /** 0..2 — defaults to 1. */
  pitch?: number;
}

export interface BrowserTtsState {
  isSupported: boolean;
  isSpeaking: boolean;
  isPaused: boolean;
  speak: (text: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

type TtsEvent = 'started' | 'paused' | 'resumed' | 'ended' | 'cancelled' | 'errored';

interface TtsBroadcastDetail {
  event: TtsEvent;
  ownerId: number;
}

const TTS_EVENT = 'df:tts-state';

function broadcast(event: TtsEvent, ownerId: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<TtsBroadcastDetail>(TTS_EVENT, { detail: { event, ownerId } }));
}

/** Module-level state: which instance currently owns the global
 *  speechSynthesis handle. Set by the instance that calls speak(). When
 *  any instance hears an ended/cancelled/errored broadcast, all instances
 *  snap to idle — so the "two editors desync" bug never happens. */
let activeOwnerId: number | null = null;
let nextOwnerId = 0;

/** Every currently-mounted `useBrowserTts` consumer. Used to detect
 *  "orphaned" playback: audio is coming out of the OS speech engine but the
 *  React instance that started it has unmounted (note switch, route change,
 *  full reload). In that case nobody can render a stop button, so the next
 *  mount claims idle by cancelling. */
const mountedOwnerIds = new Set<number>();

/** Cancel whatever the OS is speaking and forget the owner. Safe to call
 *  when unsupported / when nothing is playing. */
function cancelGlobalSpeech(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore — some engines throw when cancelled with an empty queue */
  }
  activeOwnerId = null;
}

/** True when the OS speech engine is actively producing audio. */
function isSpeechActive(): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;
  const s = window.speechSynthesis;
  return Boolean(s.speaking || s.pending || s.paused);
}

/** Resolve the voice for the requested language.
 *
 *  Deliberately returns `null` when no voice matches the language instead of
 *  falling back to `voices[0]`. `SpeechSynthesisUtterance.lang` is already
 *  set to `zh-CN` / `en-US`, so leaving `voice` unset lets the engine pick a
 *  matching voice on its own — including on cold start, when `getVoices()`
 *  hasn't populated yet (Chrome/Safari fill it asynchronously). Forcing an
 *  unrelated `voices[0]` (typically an English voice on a CN-region machine)
 *  would override `lang` and read Chinese text with English phonemes. */
export function pickVoice(language: 'zh' | 'en', preferredVoiceName?: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  if (preferredVoiceName) {
    const match = voices.find((voice) => voice.name === preferredVoiceName);
    if (match) return match;
  }
  const tagPrefix = language === 'zh' ? 'zh' : 'en';
  return voices.find((voice) => voice.lang.toLowerCase().startsWith(tagPrefix)) ?? null;
}

export function useBrowserTts(options: BrowserTtsOptions = {}): BrowserTtsState {
  const { language = 'zh', preferredVoiceName, rate = 1, pitch = 1 } = options;
  const isSupported = typeof window !== 'undefined' && Boolean(window.speechSynthesis);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  // Each instance gets a unique id; broadcasts carry this so we know
  // whether to mirror the state change or ignore it.
  const ownerIdRef = useRef<number>(-1);
  if (ownerIdRef.current === -1) {
    ownerIdRef.current = ++nextOwnerId;
  }

  // Reset local state when we are no longer the owner — either because
  // another instance pre-empted us, or because speechSynthesis ended.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<TtsBroadcastDetail>).detail;
      // The owner already applied the change via its onend/onerror
      // handler; non-owners just listen.
      if (detail.ownerId === ownerIdRef.current) return;
      if (detail.event === 'started') {
        // Another instance just started speaking — abandon any local
        // speaking flag (we never owned it) and flip to idle.
        setIsSpeaking(false);
        setIsPaused(false);
        return;
      }
      // Any of ended / cancelled / errored / paused / resumed on a
      // different owner means global playback state changed; mirror it.
      if (detail.event === 'cancelled' || detail.event === 'ended' || detail.event === 'errored') {
        setIsSpeaking(false);
        setIsPaused(false);
      } else if (detail.event === 'paused') {
        setIsPaused(true);
      } else if (detail.event === 'resumed') {
        setIsPaused(false);
      }
    };
    window.addEventListener(TTS_EVENT, handler);
    return () => {
      window.removeEventListener(TTS_EVENT, handler);
    };
  }, []);

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    // `cancel()` tears down the *global* queue, so whoever owned it is no
    // longer speaking. Clear ownership unconditionally — using the
    // render-time `isOwner` snapshot here would leave `activeOwnerId`
    // pointing at a silent instance and block the orphan-recovery path.
    activeOwnerId = null;
    // Drop the reference so the pending onend/onerror from the cancelled
    // utterance is recognised as stale and doesn't touch fresh state.
    utteranceRef.current = null;
    // Broadcast so any other instance snaps to idle too.
    broadcast('cancelled', ownerIdRef.current);
    setIsSpeaking(false);
    setIsPaused(false);
  }, [isSupported]);

  const pause = useCallback(() => {
    if (!isSupported) return;
    if (!isSpeaking) return;
    window.speechSynthesis.pause();
    broadcast('paused', ownerIdRef.current);
    setIsPaused(true);
  }, [isSupported, isSpeaking]);

  const resume = useCallback(() => {
    if (!isSupported) return;
    if (!isPaused) return;
    window.speechSynthesis.resume();
    broadcast('resumed', ownerIdRef.current);
    setIsPaused(false);
  }, [isSupported, isPaused]);

  const speak = useCallback((text: string) => {
    if (!isSupported) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    // Cancel any prior utterance before starting a new one — otherwise
    // Chromium queues them up and the UI gets out of sync with playback.
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.lang = language === 'zh' ? 'zh-CN' : 'en-US';
    const voice = pickVoice(language, preferredVoiceName);
    if (voice) utterance.voice = voice;
    const ourOwnerId = ownerIdRef.current;

    // A cancelled utterance still fires `onend`/`onerror` asynchronously.
    // Two guards, because they catch different races:
    //  1. `utteranceRef.current !== utterance` — a newer `speak()` on THIS
    //     instance superseded us (ownerId is identical in that case, so the
    //     owner check alone would let a stale error flip the new utterance,
    //     which is still playing, back to idle).
    //  2. `activeOwnerId` no longer being us — a *different* instance took
    //     over; we must not clobber its state.
    const isStale = () => utteranceRef.current !== utterance
      || (activeOwnerId !== ourOwnerId && activeOwnerId !== null);

    utterance.onend = () => {
      if (isStale()) return;
      broadcast('ended', ourOwnerId);
      if (activeOwnerId === ourOwnerId) activeOwnerId = null;
      if (utteranceRef.current === utterance) utteranceRef.current = null;
      setIsSpeaking(false);
      setIsPaused(false);
    };
    utterance.onerror = () => {
      if (isStale()) return;
      broadcast('errored', ourOwnerId);
      if (activeOwnerId === ourOwnerId) activeOwnerId = null;
      if (utteranceRef.current === utterance) utteranceRef.current = null;
      setIsSpeaking(false);
      setIsPaused(false);
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    activeOwnerId = ourOwnerId;
    broadcast('started', ourOwnerId);
    setIsSpeaking(true);
    setIsPaused(false);
  }, [isSupported, language, preferredVoiceName, rate, pitch]);

  // Mount/unmount bookkeeping + orphaned-playback recovery.
  //
  //  - On mount: register this instance. If the OS engine is speaking but
  //    no mounted instance owns it (owner id is null, or points at an
  //    unmounted consumer — e.g. the user reloaded the page mid-read),
  //    cancel. Otherwise the user hears audio with no on-screen control.
  //  - On unmount: if we were the owner, cancel. If our instance was the
  //    last mounted consumer while audio is still playing, cancel too.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = ownerIdRef.current;
    mountedOwnerIds.add(id);
    if (isSpeechActive() && (activeOwnerId === null || !mountedOwnerIds.has(activeOwnerId))) {
      cancelGlobalSpeech();
    }
    return () => {
      mountedOwnerIds.delete(id);
      // Don't rely on the captured `isSupported` closure — the test
      // environment may have torn down `speechSynthesis` between render
      // and unmount. Read the live value at cleanup time.
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const weOwnIt = activeOwnerId === id;
      const orphaned = activeOwnerId !== null && !mountedOwnerIds.has(activeOwnerId);
      if (weOwnIt || (orphaned && mountedOwnerIds.size === 0) || (mountedOwnerIds.size === 0 && isSpeechActive())) {
        cancelGlobalSpeech();
      }
    };
  }, []);

  // Hard navigation / window close: the React tree is about to be torn
  // down, so nothing will render a stop control afterwards. Cancel here
  // rather than relying on unmount ordering (which is not guaranteed on
  // `pagehide`). We deliberately do NOT cancel on `visibilitychange` —
  // listening while working in another tab is a legitimate use.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPageHide = () => cancelGlobalSpeech();
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
    };
  }, []);

  return useMemo(
    () => ({ isSupported, isSpeaking, isPaused, speak, stop, pause, resume }),
    [isSupported, isSpeaking, isPaused, speak, stop, pause, resume],
  );
}