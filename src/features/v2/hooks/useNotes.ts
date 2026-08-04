/**
 * React Query hooks for NoteDocument (spec §5.2 / §7.3 / F-02A).
 *
 * The hooks wrap the `client.ts` API with a small set of opinionated
 * defaults:
 *
 *  - List keys are workspace-scoped through the shared `queryKeys` factory so the
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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
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
import { queryKeys } from '../../../queryKeys';
import { useWorkspaceScope } from '../../../workspaceScope';

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface UseNotesOpts {
  state?: NoteState;
  kind?: NoteKind;
  q?: string;
}

export function useNotes(opts: UseNotesOpts = {}): UseQueryResult<{ notes: NoteDocument[]; total: number }> {
  const workspaceId = useWorkspaceScope();
  return useQuery({
    queryKey: queryKeys.notes(workspaceId, { state: opts.state ?? null, kind: opts.kind ?? null, q: opts.q ?? null }),
    queryFn: () => listNotes(opts),
    staleTime: 15_000,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// Single note
// ---------------------------------------------------------------------------

export function useNote(id: string | null | undefined): UseQueryResult<{ note: NoteDocument }> {
  const workspaceId = useWorkspaceScope();
  return useQuery({
    queryKey: queryKeys.note(workspaceId, id ?? ''),
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
  const workspaceId = useWorkspaceScope();
  return useMutation({
    mutationFn: (input) => createNote(input),
    onSuccess: (data) => {
      // Seed the detail cache before selecting the new note so the editor is
      // immediately writable instead of flashing a loading spinner.
      qc.setQueryData(queryKeys.note(workspaceId, data.note.id), data);
      qc.setQueryData<{ notes: NoteDocument[]; total: number }>(
        queryKeys.notes(workspaceId, { state: null, kind: null, q: null }),
        (current) => {
          if (!current) return { notes: [data.note], total: 1 };
          if (current.notes.some((note) => note.id === data.note.id)) return current;
          return {
            notes: [data.note, ...current.notes],
            total: current.total + 1,
          };
        },
      );
      qc.invalidateQueries({ queryKey: queryKeys.notesRoot(workspaceId) });
    },
  });
}

export interface UpdateNoteVars {
  id: string;
  input: UpdateNoteInput;
}

export function useUpdateNote(): UseMutationResult<{ note: NoteDocument }, V2ApiError, UpdateNoteVars> {
  const qc = useQueryClient();
  const workspaceId = useWorkspaceScope();
  return useMutation({
    mutationFn: ({ id, input }) => updateNote(id, input),
    onSuccess: (data, vars) => {
      qc.setQueryData(queryKeys.note(workspaceId, vars.id), data);
      const structuralChange = Object.keys(vars.input).some(
        (key) => !['expectedAutoSaveVersion', 'body', 'title'].includes(key),
      );
      if (structuralChange) {
        if (vars.input.state !== undefined) {
          qc.setQueriesData<{ notes: NoteDocument[]; total: number }>(
            { queryKey: queryKeys.notesRoot(workspaceId), exact: false },
            (current) => {
              if (!current || !Array.isArray(current.notes)) return current;
              const notes = current.notes.filter((note) => note.id !== data.note.id);
              return notes.length === current.notes.length
                ? current
                : { ...current, notes, total: Math.max(0, current.total - 1) };
            },
          );
        }
        qc.invalidateQueries({ queryKey: queryKeys.notesRoot(workspaceId), exact: false });
        return;
      }
      // Autosave runs while the user types. Patch cached list rows in place
      // instead of refetching every Notes query after each debounce.
      qc.setQueriesData<{ notes: NoteDocument[]; total: number }>(
        { queryKey: queryKeys.notesRoot(workspaceId), exact: false },
        (current) => {
          if (!current || !Array.isArray(current.notes)) return current;
          return {
            ...current,
            notes: current.notes.map((note) => note.id === data.note.id ? data.note : note),
          };
        },
      );
    },
  });
}

export function useDeleteNote(): UseMutationResult<{ ok: boolean }, V2ApiError, string> {
  const qc = useQueryClient();
  const workspaceId = useWorkspaceScope();
  return useMutation({
    mutationFn: (id) => deleteNote(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: queryKeys.note(workspaceId, id) });
      qc.setQueriesData<{ notes: NoteDocument[]; total: number }>(
        { queryKey: queryKeys.notesRoot(workspaceId), exact: false },
        (current) => {
          if (!current || !Array.isArray(current.notes)) return current;
          const notes = current.notes.filter((note) => note.id !== id);
          if (notes.length === current.notes.length) return current;
          return {
            ...current,
            notes,
            total: Math.max(0, current.total - 1),
          };
        },
      );
      qc.invalidateQueries({ queryKey: queryKeys.notesRoot(workspaceId), exact: false });
    },
  });
}

export interface SetNoteArchivedVars {
  id: string;
  archived: boolean;
  expectedAutoSaveVersion: number;
}

/**
 * Archive and restore use the same versioned write path as every other note
 * edit. This keeps a state change from racing with an in-flight autosave and
 * makes the transition symmetric: archived=true hides the note from working
 * views, archived=false restores it as an active note.
 */
export function useSetNoteArchived(): UseMutationResult<
  { note: NoteDocument },
  V2ApiError,
  SetNoteArchivedVars
> {
  const qc = useQueryClient();
  const workspaceId = useWorkspaceScope();
  return useMutation({
    mutationFn: async ({ id, archived, expectedAutoSaveVersion }) => {
      const state = archived ? 'archived' : 'active';
      try {
        return await updateNote(id, { state, expectedAutoSaveVersion });
      } catch (err) {
        if (!(err instanceof V2ApiError) || err.body?.code !== 'concurrent_modification') {
          throw err;
        }
        // State-only transitions are safe to retry against the newest note:
        // unlike body/title autosaves they cannot overwrite user-authored text.
        const fresh = await getNote(id);
        return updateNote(id, {
          state,
          expectedAutoSaveVersion: fresh.note.autoSaveVersion,
        });
      }
    },
    onSuccess: (data, { id }) => {
      qc.setQueryData(queryKeys.note(workspaceId, id), data);
      if (data.note.state === 'archived') {
        qc.setQueryData<{ notes: NoteDocument[]; total: number }>(
          queryKeys.notes(workspaceId, { state: 'archived', kind: null, q: null }),
          (current) => {
            if (!current) return { notes: [data.note], total: 1 };
            const notes = [data.note, ...current.notes.filter((note) => note.id !== id)];
            return { ...current, notes, total: notes.length };
          },
        );
      } else {
        qc.setQueryData<{ notes: NoteDocument[]; total: number }>(
          queryKeys.notes(workspaceId, { state: null, kind: null, q: null }),
          (current) => {
            if (!current) return { notes: [data.note], total: 1 };
            const notes = [data.note, ...current.notes.filter((note) => note.id !== id)];
            return { ...current, notes, total: notes.length };
          },
        );
      }
      qc.setQueriesData<{ notes: NoteDocument[]; total: number }>(
        { queryKey: queryKeys.notesRoot(workspaceId), exact: false },
        (current) => {
          if (!current || !Array.isArray(current.notes)) return current;
          if (data.note.state === 'archived') return current;
          const notes = current.notes.filter((note) => note.id !== id);
          return { ...current, notes, total: notes.length };
        },
      );
      qc.invalidateQueries({ queryKey: queryKeys.notesRoot(workspaceId), exact: false });
    },
  });
}

// ---------------------------------------------------------------------------
// Backlinks
// ---------------------------------------------------------------------------

export function useNoteBacklinks(id: string | null | undefined): UseQueryResult<{ backlinks: NoteBacklinks }> {
  const workspaceId = useWorkspaceScope();
  return useQuery({
    queryKey: [...queryKeys.note(workspaceId, id ?? ''), 'backlinks'],
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

export type AutosaveVars = Omit<Partial<UpdateNoteInput>, 'expectedAutoSaveVersion'>;

export interface UseNoteAutosaveResult {
  status: AutosaveStatus;
  lastSavedVersion: number;
  lastError?: string;
  /** Debounced save — call from onChange. Coalesces rapid keystrokes. */
  schedule: (vars: AutosaveVars) => void;
  /** Force a save now; returns false when persistence failed or conflicted. */
  flush: () => Promise<boolean>;
}

const DEBOUNCE_MS = 800;

interface AutosavePersistResult {
  ok: boolean;
  note?: NoteDocument;
}

export function useNoteAutosave(note: NoteDocument | null | undefined): UseNoteAutosaveResult {
  const update = useUpdateNote();
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedVersion, setLastSavedVersion] = useState<number>(note?.autoSaveVersion ?? 0);
  const [lastError, setLastError] = useState<string | undefined>();
  // The current `expectedAutoSaveVersion` we will send on the next save.
  // It is bumped after every successful save so the server can detect
  // concurrent edits.
  const expectedRef = useRef<number>(note?.autoSaveVersion ?? 0);
  // Snapshot used for field-level three-way conflict checks.
  const baseRef = useRef<NoteDocument | null>(note ?? null);
  const generationRef = useRef(0);
  // Pending vars that the debounce timer will eventually flush.
  const pendingRef = useRef<AutosaveVars>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A "in-flight" promise the editor can await when it wants to force
  // a flush (e.g. before unmount).
  const inflightRef = useRef<Promise<AutosavePersistResult> | null>(null);

  // Keep the expectedRef in sync when the note identity changes (e.g.
  // the user switched to a different note in the same component).
  useLayoutEffect(() => {
    generationRef.current += 1;
    expectedRef.current = note?.autoSaveVersion ?? 0;
    baseRef.current = note ?? null;
    setLastSavedVersion(note?.autoSaveVersion ?? 0);
    pendingRef.current = {};
    setStatus('idle');
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(
    async (
      vars: AutosaveVars,
      generation: number,
      queuedNote: NoteDocument | null,
      expected: number,
      base: NoteDocument | null,
    ): Promise<AutosavePersistResult> => {
      if (!queuedNote) return { ok: true };
      const isCurrentNote = () => generationRef.current === generation;
      // Nothing to do? Don't ping the server.
      const hasChange = Object.keys(vars).length > 0;
      if (!hasChange) return { ok: true, note: queuedNote };

      if (isCurrentNote()) {
        setStatus('saving');
        setLastError(undefined);
      }
      try {
        const { note: next } = await update.mutateAsync({
          id: queuedNote.id,
          input: {
            expectedAutoSaveVersion: expected,
            ...vars,
          },
        });
        if (isCurrentNote()) {
          expectedRef.current = next.autoSaveVersion;
          baseRef.current = next;
          setLastSavedVersion(next.autoSaveVersion);
          setStatus('saved');
        }
        return { ok: true, note: next };
      } catch (err) {
        if (err instanceof V2ApiError && err.body?.code === 'concurrent_modification') {
          try {
            const fresh = await getNote(queuedNote.id);
            const conflictingFields = Object.keys(vars).filter((key) => {
              const field = key as keyof NoteDocument;
              const intended = vars[key as keyof AutosaveVars];
              const before = base?.[field];
              const remote = fresh.note[field];
              return JSON.stringify(remote) !== JSON.stringify(before)
                && JSON.stringify(remote) !== JSON.stringify(intended);
            });

            if (conflictingFields.length > 0) {
              // Never replay a locally edited field over a different remote
              // value. Keep it queued and ask the user to reconcile.
              if (isCurrentNote()) {
                pendingRef.current = { ...vars, ...pendingRef.current };
                setStatus('conflict');
                setLastError(
                  `This note changed elsewhere (${conflictingFields.join(', ')}). `
                  + 'Your local edits remain open.',
                );
              }
              return { ok: false };
            }

            // Remote changes touched other fields only, so replaying this
            // field-level patch is a safe three-way merge.
            const retried = await update.mutateAsync({
              id: queuedNote.id,
              input: {
                expectedAutoSaveVersion: fresh.note.autoSaveVersion,
                ...vars,
              },
            });
            if (isCurrentNote()) {
              expectedRef.current = retried.note.autoSaveVersion;
              baseRef.current = retried.note;
              setLastSavedVersion(retried.note.autoSaveVersion);
              setStatus('saved');
            }
            return { ok: true, note: retried.note };
          } catch (retryErr) {
            if (isCurrentNote()) {
              pendingRef.current = { ...vars, ...pendingRef.current };
              setStatus(
                retryErr instanceof V2ApiError
                && retryErr.body?.code === 'concurrent_modification'
                  ? 'conflict'
                  : 'error',
              );
              setLastError(
                retryErr instanceof V2ApiError
                  ? retryErr.body.message
                  : String(retryErr),
              );
            }
          }
        } else {
          // Retain failed edits so a later keystroke or explicit flush retries
          // the complete latest patch instead of silently dropping it.
          if (isCurrentNote()) {
            pendingRef.current = { ...vars, ...pendingRef.current };
            setStatus('error');
            setLastError(err instanceof V2ApiError ? err.body.message : String(err));
          }
        }
        return { ok: false };
      }
    },
    [update],
  );

  const enqueue = useCallback(
    (vars: AutosaveVars): Promise<AutosavePersistResult> => {
      const previous = inflightRef.current;
      // Capture identity when the task is queued, not when it eventually
      // starts after older writes. A queued save for note A must still write
      // A after the editor switches to B, without touching B's UI refs.
      const generation = generationRef.current;
      const queuedNote = note ?? null;
      const queuedExpected = expectedRef.current;
      const queuedBase = baseRef.current;
      const run = (async () => {
        const previousResult = previous ? await previous : undefined;
        // `undefined === undefined` is true. Without both guards, flushing an
        // editor before its note has loaded takes the true branch and reads
        // `previousResult.note` from undefined during unmount/navigation.
        const previousNote = previousResult?.note && queuedNote
          && previousResult.note.id === queuedNote.id
          ? previousResult.note
          : undefined;
        const isCurrentNote = generationRef.current === generation;
        // A previous failed write may have re-queued fields while this save
        // was waiting. Merge them now so state changes cannot leapfrog and
        // discard an unsaved body/title.
        const requeued = isCurrentNote ? pendingRef.current : {};
        if (isCurrentNote) pendingRef.current = {};
        return persist(
          { ...vars, ...requeued },
          generation,
          queuedNote,
          previousNote?.autoSaveVersion ?? queuedExpected,
          previousNote ?? queuedBase,
        );
      })();
      inflightRef.current = run;
      void run.finally(() => {
        if (inflightRef.current === run) inflightRef.current = null;
      });
      return run;
    },
    [note, persist],
  );

  const schedule = useCallback(
    (vars: AutosaveVars) => {
      pendingRef.current = { ...pendingRef.current, ...vars };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const next = pendingRef.current;
        pendingRef.current = {};
        void enqueue(next);
      }, DEBOUNCE_MS);
    },
    [enqueue],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = pendingRef.current;
    pendingRef.current = {};
    return (await enqueue(next)).ok;
  }, [enqueue]);

  return { status, lastSavedVersion, lastError, schedule, flush };
}
