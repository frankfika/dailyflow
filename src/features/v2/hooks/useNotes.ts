/**
 * React Query hooks for NoteDocument (spec §5.2 / §7.3 / F-02A).
 *
 * The hooks wrap the `client.ts` API with a small set of opinionated
 * defaults:
 *
 *  - List keys are namespaced `['v2-notes', state, kind, q]` so the
 *    Inbox / Recent / Daily / etc. views can mount independently and
 *    evict on a single mutation without invalidating the world.
 *  - Mutations return the server's response and the React Query
 *    invalidation targets the list and the specific note id so the
 *    editor view re-fetches the next state immediately.
 *  - The autosave hook (`useNoteAutosave`) implements the
 *    version-conflict retry policy: on 409, it bumps the local
 *    `expectedAutoSaveVersion` from the server's response and retries
 *    the patch once, then surfaces the conflict to the caller.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  archiveNote,
  createNote,
  deleteNote,
  getNote,
  getNoteBacklinks,
  listNotes,
  updateNote,
  V2ApiError,
  type CreateNoteInput,
  type NoteBacklinks,
  type NoteDocument,
  type NoteKind,
  type NoteState,
  type UpdateNoteInput,
} from '../api/client';

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface UseNotesOpts {
  state?: NoteState;
  kind?: NoteKind;
  q?: string;
}

export function useNotes(opts: UseNotesOpts = {}): UseQueryResult<{ notes: NoteDocument[]; total: number }> {
  return useQuery({
    queryKey: ['v2-notes', opts.state ?? null, opts.kind ?? null, opts.q ?? null],
    queryFn: () => listNotes(opts),
    staleTime: 15_000,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// Single note
// ---------------------------------------------------------------------------

export function useNote(id: string | null | undefined): UseQueryResult<{ note: NoteDocument }> {
  return useQuery({
    queryKey: ['v2-notes', 'one', id],
    queryFn: () => getNote(id as string),
    enabled: Boolean(id),
    staleTime: 10_000,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateNote(): UseMutationResult<{ note: NoteDocument }, V2ApiError, CreateNoteInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => createNote(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v2-notes'] });
    },
  });
}

export interface UpdateNoteVars {
  id: string;
  input: UpdateNoteInput;
}

export function useUpdateNote(): UseMutationResult<{ note: NoteDocument }, V2ApiError, UpdateNoteVars> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }) => updateNote(id, input),
    onSuccess: (data, vars) => {
      qc.setQueryData(['v2-notes', 'one', vars.id], data);
      qc.invalidateQueries({ queryKey: ['v2-notes'], exact: false });
    },
  });
}

export function useDeleteNote(): UseMutationResult<{ ok: boolean }, V2ApiError, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => deleteNote(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: ['v2-notes', 'one', id] });
      qc.invalidateQueries({ queryKey: ['v2-notes'], exact: false });
    },
  });
}

export function useArchiveNote(): UseMutationResult<{ note: NoteDocument }, V2ApiError, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => archiveNote(id),
    onSuccess: (data, id) => {
      qc.setQueryData(['v2-notes', 'one', id], data);
      qc.invalidateQueries({ queryKey: ['v2-notes'], exact: false });
    },
  });
}

// ---------------------------------------------------------------------------
// Backlinks
// ---------------------------------------------------------------------------

export function useNoteBacklinks(id: string | null | undefined): UseQueryResult<{ backlinks: NoteBacklinks }> {
  return useQuery({
    queryKey: ['v2-notes', 'backlinks', id],
    queryFn: () => getNoteBacklinks(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------------
//
// A small autosave helper built on top of useUpdateNote. It debounces
// body changes, tracks the local `expectedAutoSaveVersion`, and
// transparently retries on 409 by re-reading the note and patching
// again. Callers receive the latest saved `autoSaveVersion` and a
// `status` enum so the editor can render "Saving…" / "Saved" /
// "Conflict".
//
// Usage:
//
//   const { status, lastSavedVersion, schedule, flush } = useNoteAutosave(note);
//
//   // On every keystroke:
//   schedule({ body: editorBody });
//
//   // On unmount or explicit save:
//   await flush();
//
// The hook is intentionally tiny — no draft caching, no offline
// queue. Spec F-02A asks the server to be the source of truth for
// drafts, so any work the user types will round-trip through the
// server (debounced) and survive a refresh.

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

export interface AutosaveVars {
  body?: string;
  title?: string | null;
}

export interface UseNoteAutosaveResult {
  status: AutosaveStatus;
  lastSavedVersion: number;
  lastError?: string;
  /** Debounced save — call from onChange. Coalesces rapid keystrokes. */
  schedule: (vars: AutosaveVars) => void;
  /** Force a save right now (e.g. before unmount, before navigation). */
  flush: () => Promise<void>;
}

const DEBOUNCE_MS = 800;

export function useNoteAutosave(note: NoteDocument | null | undefined): UseNoteAutosaveResult {
  const update = useUpdateNote();
  const qc = useQueryClient();
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedVersion, setLastSavedVersion] = useState<number>(note?.autoSaveVersion ?? 0);
  const [lastError, setLastError] = useState<string | undefined>();
  // The current `expectedAutoSaveVersion` we will send on the next save.
  // It is bumped after every successful save so the server can detect
  // concurrent edits.
  const expectedRef = useRef<number>(note?.autoSaveVersion ?? 0);
  // Pending vars that the debounce timer will eventually flush.
  const pendingRef = useRef<AutosaveVars>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A "in-flight" promise the editor can await when it wants to force
  // a flush (e.g. before unmount).
  const inflightRef = useRef<Promise<void> | null>(null);

  // Keep the expectedRef in sync when the note identity changes (e.g.
  // the user switched to a different note in the same component).
  useEffect(() => {
    expectedRef.current = note?.autoSaveVersion ?? 0;
    setLastSavedVersion(note?.autoSaveVersion ?? 0);
    pendingRef.current = {};
    setStatus('idle');
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(
    async (vars: AutosaveVars): Promise<void> => {
      if (!note) return;
      // Nothing to do? Don't ping the server.
      const hasChange = vars.body !== undefined || vars.title !== undefined;
      if (!hasChange) return;

      setStatus('saving');
      setLastError(undefined);
      const expected = expectedRef.current;
      try {
        const { note: next } = await update.mutateAsync({
          id: note.id,
          input: {
            expectedAutoSaveVersion: expected,
            body: vars.body,
            title: vars.title,
          },
        });
        expectedRef.current = next.autoSaveVersion;
        setLastSavedVersion(next.autoSaveVersion);
        setStatus('saved');
      } catch (err) {
        if (err instanceof V2ApiError && err.body?.code === 'concurrent_modification') {
          // Re-read the note, adopt its autoSaveVersion, then retry once.
          try {
            const fresh = await qc.fetchQuery({
              queryKey: ['v2-notes', 'one', note.id],
              queryFn: () => getNote(note.id),
            });
            expectedRef.current = fresh.note.autoSaveVersion;
            // Patch again with the fresh version + the same vars.
            const retried = await update.mutateAsync({
              id: note.id,
              input: {
                expectedAutoSaveVersion: fresh.note.autoSaveVersion,
                body: vars.body,
                title: vars.title,
              },
            });
            expectedRef.current = retried.note.autoSaveVersion;
            setLastSavedVersion(retried.note.autoSaveVersion);
            setStatus('saved');
          } catch (retryErr) {
            setStatus('conflict');
            setLastError(
              retryErr instanceof V2ApiError
                ? retryErr.body.message
                : 'Autosave conflict; please refresh and merge manually.',
            );
          }
        } else {
          setStatus('error');
          setLastError(err instanceof V2ApiError ? err.body.message : String(err));
        }
      }
    },
    [note, update, qc],
  );

  const schedule = useCallback(
    (vars: AutosaveVars) => {
      pendingRef.current = { ...pendingRef.current, ...vars };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const next = pendingRef.current;
        pendingRef.current = {};
        inflightRef.current = persist(next);
      }, DEBOUNCE_MS);
    },
    [persist],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = pendingRef.current;
    pendingRef.current = {};
    inflightRef.current = persist(next);
    if (inflightRef.current) await inflightRef.current;
  }, [persist]);

  return { status, lastSavedVersion, lastError, schedule, flush };
}
