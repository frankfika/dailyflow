/**
 * Lightweight YAML-frontmatter parser for v2 markdown files.
 *
 * We intentionally avoid `gray-matter` / `js-yaml` to keep dependencies low
 * and the failure surface tight. Supports the subset we write:
 *   - scalar strings (with "..." quoting)
 *   - lists: [item1, item2, ...]
 *   - nested maps with 2-space indent (for external_ref, locator, meta)
 *
 * Unknown keys are preserved as raw strings; the Zod schema applied at load
 * time catches any drift.
 */

export interface ParsedDoc {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(text: string): ParsedDoc {
  if (!text.startsWith('---')) {
    return { data: {}, body: text };
  }
  const end = text.indexOf('\n---', 3);
  if (end === -1) {
    return { data: {}, body: text };
  }
  const header = text.slice(3, end).replace(/^\n/, '');
  const after = text.slice(end + 4);
  // Skip the newline after the closing '---'
  const body = after.startsWith('\n') ? after.slice(1) : after;
  const data = parseYamlBlock(header);
  return { data, body };
}

function parseYamlBlock(block: string): Record<string, unknown> {
  const lines = block.split('\n');
  const result: Record<string, unknown> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || /^\s*#/.test(line)) {
      i++;
      continue;
    }
    const m = /^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1]!;
    const rest = (m[2] ?? '').trim();

    if (rest === '' || rest === '|' || rest === '>') {
      // Could be nested map. Look at next line indent.
      const indentMatch = /^( {2,})(\S)/.exec(lines[i + 1] ?? '');
      if (indentMatch) {
        const childIndent = indentMatch[1]!.length;
        const childLines: string[] = [];
        let j = i + 1;
        while (j < lines.length) {
          const ln = lines[j]!;
          if (ln === '') {
            childLines.push(ln);
            j++;
            continue;
          }
          const leading = /^( *)(.*)$/.exec(ln);
          const leadLen = leading?.[1]?.length ?? 0;
          if (leadLen < childIndent) break;
          childLines.push(ln.slice(childIndent));
          j++;
        }
        result[key] = parseYamlBlock(childLines.join('\n'));
        i = j;
        continue;
      } else {
        result[key] = '';
        i++;
        continue;
      }
    }

    if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim();
      if (!inner) {
        result[key] = [];
      } else if (inner.startsWith('{') || inner.startsWith('"') && inner.includes(':')) {
        // Array of complex objects / JSON-encoded array; treat as JSON.
        try {
          result[key] = JSON.parse(`[${inner}]`);
        } catch {
          // Fall back to string-list parsing
          result[key] = splitList(inner).map(parseScalar);
        }
      } else {
        result[key] = splitList(inner).map(parseScalar);
      }
      i++;
      continue;
    }

    // Quoted JSON-encoded array (used by the serializer for arrays of complex objects).
    if (
      (rest.startsWith('"') && rest.endsWith('"') && rest.length > 2) ||
      (rest.startsWith('"[{') && rest.endsWith(']"'))
    ) {
      const unquoted = parseScalar(rest);
      if (unquoted.startsWith('[') || unquoted.startsWith('{')) {
        try {
          const parsed = JSON.parse(unquoted);
          if (Array.isArray(parsed) || (typeof parsed === 'object' && parsed !== null)) {
            result[key] = parsed;
            i++;
            continue;
          }
        } catch {
          /* fall through to scalar */
        }
      }
    }

    // Try to coerce booleans and numbers; keep strings otherwise.
    const scalar = parseScalar(rest);
    if (scalar === 'true') {
      result[key] = true;
    } else if (scalar === 'false') {
      result[key] = false;
    } else if (/^-?\d+$/.test(scalar)) {
      const n = Number(scalar);
      result[key] = Number.isSafeInteger(n) ? n : scalar;
    } else if (/^-?\d+\.\d+$/.test(scalar)) {
      const n = Number(scalar);
      result[key] = Number.isFinite(n) ? n : scalar;
    } else {
      result[key] = scalar;
    }
    i++;
  }
  return result;
}

function splitList(inner: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inStr = false;
  let escape = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (escape) {
      buf += ch;
      escape = false;
      continue;
    }
    if (ch === '\\') {
      buf += ch;
      escape = true;
      continue;
    }
    if (ch === '"') {
      buf += ch;
      inStr = !inStr;
      continue;
    }
    if (ch === ',' && !inStr) {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim().length > 0) out.push(buf.trim());
  return out;
}

function parseScalar(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1);
    s = s.replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
  }
  return s;
}

/**
 * Coerce string values that look like JSON objects back into plain objects.
 * Used for nested map values (external_ref, locator, meta).
 */
export function reviveNestedObjects<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = reviveNestedObjects(v as Record<string, unknown>);
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          out[k] = JSON.parse(trimmed);
        } catch {
          out[k] = v;
        }
      } else {
        out[k] = v;
      }
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

/**
 * Convert snake_case keys to camelCase recursively. Spec §12.3 examples use
 * snake_case (e.g. `schema_version`, `created_at`, `due_at`); the runtime
 * Zod schemas use camelCase. This is the single chokepoint that bridges
 * the two conventions.
 */
export function snakeToCamel<T = unknown>(data: unknown): T {
  if (Array.isArray(data)) {
    return data.map(d => snakeToCamel(d)) as unknown as T;
  }
  if (data && typeof data === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      const camel = k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
      out[camel] = snakeToCamel(v);
    }
    return out as T;
  }
  return data as T;
}
