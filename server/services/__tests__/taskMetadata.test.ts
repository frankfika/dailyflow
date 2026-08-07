/**
 * taskMetadata tests.
 *
 * Covers Topic Spaces Phase 2 §3.4:
 *   - `^space:<id>` system marker helpers
 *   - idempotent set / clear semantics
 *   - CJK support in the marker value
 *   - placement immediately before the `^id-` marker
 */
import { describe, it, expect } from 'vitest';
import {
  spaceIdToMarker,
  markerToSpaceId,
  setSpaceMarker,
  findSpaceMarkerLine,
  extractTaskId,
  stripAllSpaceMarkers,
  SPACE_MARKER_PREFIX,
  ID_MARKER_PREFIX,
} from '../taskMetadata.js';

describe('spaceIdToMarker / markerToSpaceId', () => {
  it('builds a marker from a plain ascii id', () => {
    expect(spaceIdToMarker('tw_finance')).toBe('^space:tw_finance');
  });

  it('preserves CJK characters in the marker value', () => {
    // The Topic Space id can be a slugged form of a Chinese title
    // (see topicSpaces.ts → slugify). The marker must round-trip
    // those bytes faithfully.
    expect(spaceIdToMarker('tw_融资计划')).toBe('^space:tw_融资计划');
  });

  it('round-trips the marker back to the id', () => {
    const id = 'tw_融资计划';
    expect(markerToSpaceId(`- [ ] 准备BP ${spaceIdToMarker(id)} ^id-t1`)).toBe(id);
  });

  it('returns undefined when the marker is absent', () => {
    expect(markerToSpaceId('- [ ] 没有marker的task ^id-t1')).toBeUndefined();
    expect(markerToSpaceId('plain line of text')).toBeUndefined();
  });

  it('returns undefined for an empty marker value', () => {
    // The first non-whitespace token after "^space:" must be a
    // real id; if it's missing or just "^" (i.e. the next marker),
    // we treat the whole thing as absent.
    expect(markerToSpaceId('- [ ] empty ^space: ^id-t1')).toBeUndefined();
  });
});

describe('setSpaceMarker', () => {
  it('adds a marker immediately before the existing ^id- marker', () => {
    const line = '- [ ] 准备BP ^id-t1';
    const out = setSpaceMarker(line, 'tw_finance');
    expect(out).toBe('- [ ] 准备BP ^space:tw_finance ^id-t1');
  });

  it('appends the marker at the end when no ^id- exists', () => {
    const line = '- [ ] 准备BP';
    const out = setSpaceMarker(line, 'tw_finance');
    expect(out).toBe('- [ ] 准备BP ^space:tw_finance');
  });

  it('replaces an existing marker with the new id', () => {
    const line = '- [ ] 准备BP ^space:old_space ^id-t1';
    const out = setSpaceMarker(line, 'new_space');
    expect(out).toBe('- [ ] 准备BP ^space:new_space ^id-t1');
    expect(out).not.toContain('old_space');
  });

  it('clears the marker when spaceId is null', () => {
    const line = '- [ ] 准备BP ^space:tw_finance ^id-t1';
    const out = setSpaceMarker(line, null);
    expect(out).toBe('- [ ] 准备BP ^id-t1');
    expect(out).not.toContain('^space:');
  });

  it('clears the marker when spaceId is undefined', () => {
    const line = '- [ ] 准备BP ^space:tw_finance ^id-t1';
    const out = setSpaceMarker(line, undefined);
    expect(out).toBe('- [ ] 准备BP ^id-t1');
  });

  it('preserves user tags and other metadata when inserting', () => {
    const line = '- [ ] 准备BP #work #urgent #deadline:2026-05-10 ^id-t1';
    const out = setSpaceMarker(line, 'tw_finance');
    expect(out).toBe(
      '- [ ] 准备BP #work #urgent #deadline:2026-05-10 ^space:tw_finance ^id-t1',
    );
  });

  it('handles CJK space ids', () => {
    const line = '- [ ] 准备BP ^id-t1';
    const out = setSpaceMarker(line, 'tw_融资');
    expect(out).toBe('- [ ] 准备BP ^space:tw_融资 ^id-t1');
    // Round-trip via the same line
    expect(markerToSpaceId(out)).toBe('tw_融资');
  });
});

describe('findSpaceMarkerLine', () => {
  it('returns the line index of the first matching marker', () => {
    const content = [
      '## Tasks',
      '',
      '- [ ] 准备BP ^space:tw_融资 ^id-t1',
      '- [ ] 其他 ^space:tw_other ^id-t2',
      '',
    ].join('\n');
    expect(findSpaceMarkerLine(content, 'tw_融资')).toBe(2);
    expect(findSpaceMarkerLine(content, 'tw_other')).toBe(3);
  });

  it('returns -1 when the marker is not present', () => {
    const content = '## Tasks\n\n- [ ] no marker\n';
    expect(findSpaceMarkerLine(content, 'missing')).toBe(-1);
  });
});

describe('extractTaskId', () => {
  it('extracts the stable id from a line', () => {
    expect(extractTaskId('- [ ] task ^id-task01')).toBe('task01');
  });
  it('returns undefined when no id is present', () => {
    expect(extractTaskId('- [ ] task with no id')).toBeUndefined();
  });
});

describe('stripAllSpaceMarkers', () => {
  it('removes every ^space: marker from the content', () => {
    const content = [
      '## Tasks',
      '- [ ] task1 ^space:tw_a ^id-t1',
      '- [ ] task2 ^space:tw_b ^id-t2',
      '',
    ].join('\n');
    const out = stripAllSpaceMarkers(content);
    expect(out).toContain('- [ ] task1 ^id-t1');
    expect(out).toContain('- [ ] task2 ^id-t2');
    expect(out).not.toContain('^space:');
  });
});

describe('prefix constants', () => {
  it('exposes the documented prefixes', () => {
    expect(SPACE_MARKER_PREFIX).toBe('^space:');
    expect(ID_MARKER_PREFIX).toBe('^id-');
  });
});
