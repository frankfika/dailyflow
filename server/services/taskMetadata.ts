/**
 * System-marker helpers for task markdown lines.
 *
 * A task line is shaped like:
 *   - [ ] title #user-tag #inherited-tag ^space:融资 ^id-task01
 *
 * `^space:<spaceId>` is the system marker that records a task's topic space
 * (Topic Spaces Phase 2 / SPEC §3.4). It is intentionally NOT a `#`-tag:
 *   - `#tags` are user-facing; they appear in the UI.
 *   - `^...` markers are system-only; they are stripped on read for the UI
 *     and rewritten on write.
 *
 * The marker supports any non-whitespace value (including CJK) so the space
 * title can be embedded without escaping. It is a system-managed field and
 * is always the *last* metadata block on the line, immediately before the
 * stable `^id-...` marker.
 *
 * These helpers are pure functions so they can be unit-tested without
 * touching the filesystem. Routes compose them with `withDateLock` and
 * the markdown parser to do the actual read-modify-write.
 */

const SPACE_MARKER_PREFIX = '^space:';
const ID_MARKER_PREFIX = '^id-';

/**
 * Build the `^space:<id>` marker string for a given space id.
 *
 *   spaceIdToMarker('tw_融资')   // -> '^space:tw_融资'
 *   spaceIdToMarker('tw_finance') // -> '^space:tw_finance'
 */
export function spaceIdToMarker(spaceId: string): string {
  return `${SPACE_MARKER_PREFIX}${spaceId}`;
}

/**
 * Extract the space id from a task line, or `undefined` if none is present.
 *
 *   markerToSpaceId('- [ ] 准备BP ^space:tw_融资 ^id-t1') // -> 'tw_融资'
 *   markerToSpaceId('- [ ] No marker here ^id-t2')       // -> undefined
 *
 * Looks at the raw line (indented description / comment lines are not
 * task lines and will not match — but callers should still pass only
 * task-line strings to be safe).
 */
export function markerToSpaceId(line: string): string | undefined {
  // Anchor on a non-capturing class so CJK / hyphens / dots / underscores
  // are all accepted in the space id, but the match terminates at the
  // first whitespace, `^` (next marker) or end of line.
  const m = line.match(/\^space:(\S+)/);
  if (!m) return undefined;
  // Defensive: a stray "^space:" with empty value (e.g. "^space: ^id-t1")
  // would still match \S+ against the next token. Walk the slice and
  // re-validate the boundary.
  const slice = m[1];
  if (!slice || slice.startsWith('^') || slice.startsWith('#')) return undefined;
  return slice;
}

/**
 * Find the line index of a `^space:<id>` marker anywhere in `content`.
 * Returns -1 if the marker is not present.
 *
 * Useful when you need to know the actual line number to splice out
 * (e.g. when repairing a broken link).
 */
export function findSpaceMarkerLine(content: string, spaceId: string): number {
  const marker = spaceIdToMarker(spaceId);
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(marker)) return i;
  }
  return -1;
}

/**
 * Set / clear the `^space:<id>` marker on a single task line.
 *
 *   - If `spaceId` is truthy, the marker is added (or replaced) immediately
 *     before the existing `^id-...` marker. If there is no `^id-` marker,
 *     the marker is appended to the end of the line.
 *   - If `spaceId` is null / undefined, any existing `^space:...` marker
 *     is removed.
 *
 * The function is a pure string transform: it does NOT parse the line into
 * a Task object. It only manipulates the `^space:` and adjacent `^id-`
 * markers. This keeps it robust against any other content (tags, project,
 * deadline, etc.) that may live in the line.
 *
 * The function tolerates lines with or without leading whitespace
 * (indented continuation lines from description parsing will round-trip
 * unchanged because they have no `^space:` or `^id-` markers).
 */
export function setSpaceMarker(line: string, spaceId: string | null | undefined): string {
  // Strip any existing ^space:... marker (with a leading space if present).
  // We do not anchor on the line start so indented lines still match.
  const withoutSpace = line.replace(/\s*\^space:\S+/g, '').replace(/\s+$/g, '');

  if (!spaceId) {
    return withoutSpace;
  }

  const newMarker = spaceIdToMarker(spaceId);
  // If the line already has a ^id-... marker, splice the space marker
  // immediately before it. Otherwise append at the tail.
  const idMatch = withoutSpace.match(/\s*\^id-\S+/);
  if (idMatch && idMatch.index !== undefined) {
    const before = withoutSpace.slice(0, idMatch.index).replace(/\s+$/g, '');
    const idPart = idMatch[0].replace(/^\s+/, '');
    return `${before} ${newMarker} ${idPart}`;
  }
  // No id marker — append at the end (with a leading space if the line
  // has any content beyond the bullet).
  if (withoutSpace.length === 0) return withoutSpace;
  return `${withoutSpace} ${newMarker}`;
}

/**
 * Walk a single task line and return the stable `^id-...` value, if any.
 * Companion to `markerToSpaceId`.
 */
export function extractTaskId(line: string): string | undefined {
  const m = line.match(/\^id-(\S+)/);
  return m ? m[1] : undefined;
}

/**
 * Strip all `^space:...` markers from a markdown body. Used when a task
 * is being moved away from a topic space and we want to clear every
 * legacy reference in one pass (e.g. when deleting a Topic Space).
 */
export function stripAllSpaceMarkers(content: string): string {
  return content.replace(/\s*\^space:\S+/g, '').replace(/[ \t]+$/gm, '');
}

// Re-export the prefix constants for callers that want to be defensive
// (e.g. diagnostic scripts that scan the file system).
export { SPACE_MARKER_PREFIX, ID_MARKER_PREFIX };
