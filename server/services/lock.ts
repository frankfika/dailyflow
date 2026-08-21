/**
 * Per-date serialization lock.
 *
 * Daily markdown files are read-modify-write artifacts — two concurrent edits
 * can both read the same v1, then write back v1' and v1'' in some order, and
 * whichever wrote last silently drops the other change. This module makes
 * mutating operations on a single date strictly serial, so each edit sees the
 * result of every prior edit.
 *
 * Usage:
 *   await withDateLock(date, async () => {
 *     const note = await readDailyNote(date, config);
 *     // ... mutate ...
 *     await writeDailyNote(date, newContent, config);
 *   });
 *
 * Different dates do not block each other; only writes against the *same* date
 * are serialized.
 */

// Each date maps to the tail of the current chain. New callers append their
// own job onto this tail and store a new tail (the promise of their own job)
// so the *next* caller can wait for it. A failed job resolves its own tail
// normally (after running `fn`) — but its `fn` rejection still propagates to
// the caller — so a single bad edit does not poison the queue.
const tails = new Map<string, Promise<unknown>>();

export async function withDateLock<T>(date: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(date) ?? Promise.resolve();

  // Our own tail = our fn wrapped to always settle (so the chain never breaks),
  // but we still re-throw the original error to the caller.
  let settle!: () => void;
  const ourTail = new Promise<void>(resolve => {
    settle = resolve;
  });

  const chain = previous
    .catch(() => undefined)            // prior job failed — keep chain alive
    .then(async () => {
      try {
        return await fn();
      } finally {
        settle();                       // unblock the next caller
      }
    });

  // The next caller should wait on `ourTail` (which only resolves once `fn`
  // settles), not on the chained promise (which only resolves once `fn`
  // *resolves*).
  tails.set(date, ourTail);

  return await chain;
}

/** Acquire several date locks in a stable order to avoid deadlocks. */
export async function withDateLocks<T>(dates: string[], fn: () => Promise<T>): Promise<T> {
  const keys = [...new Set(dates)].sort();
  const acquire = (index: number): Promise<T> =>
    index >= keys.length
      ? fn()
      : withDateLock(keys[index], () => acquire(index + 1));
  return acquire(0);
}
