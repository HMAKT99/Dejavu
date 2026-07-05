/**
 * Heuristic function extraction for JS/TS and Python — the vibecoder stack.
 * Regex + brace/indent matching, no AST. Misses exotic shapes by design;
 * catching the common 80% fast beats perfect analysis that ships never.
 */

export interface FunctionUnit {
  name: string;
  file: string;
  /** 1-based line of the declaration. */
  line: number;
  body: string;
}

const JS_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts']);
const PY_EXTS = new Set(['.py']);

const JS_DECL =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(|^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function/;

const PY_DECL = /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/;

function ext(file: string): string {
  const i = file.lastIndexOf('.');
  return i === -1 ? '' : file.slice(i).toLowerCase();
}

export function supportedFile(file: string): boolean {
  const e = ext(file);
  return JS_EXTS.has(e) || PY_EXTS.has(e);
}

export function extractFunctions(file: string, source: string): FunctionUnit[] {
  const e = ext(file);
  if (JS_EXTS.has(e)) return extractJs(file, source);
  if (PY_EXTS.has(e)) return extractPy(file, source);
  return [];
}

/** Walk forward from the declaration to the matching closing brace. */
function extractJs(file: string, source: string): FunctionUnit[] {
  const lines = source.split('\n');
  const units: FunctionUnit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(JS_DECL);
    if (!m) continue;
    const name = m[1] ?? m[2] ?? m[3] ?? '(anonymous)';
    // Find the first `{` at/after the declaration, then brace-match.
    let depth = 0;
    let started = false;
    let end = -1;
    outer: for (let j = i; j < Math.min(lines.length, i + 400); j++) {
      for (const ch of lines[j]!) {
        if (ch === '{') {
          depth++;
          started = true;
        } else if (ch === '}') {
          depth--;
          if (started && depth === 0) {
            end = j;
            break outer;
          }
        }
      }
      // Arrow with expression body: `const f = (x) => x * 2`
      if (!started && j === i && /=>\s*[^{\s]/.test(lines[i]!)) {
        end = i;
        break;
      }
    }
    if (end === -1) continue;
    units.push({ name, file, line: i + 1, body: lines.slice(i, end + 1).join('\n') });
    i = end;
  }
  return units;
}

/** Indentation-scoped bodies. */
function extractPy(file: string, source: string): FunctionUnit[] {
  const lines = source.split('\n');
  const units: FunctionUnit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(PY_DECL);
    if (!m) continue;
    const indent = m[1]!.length;
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]!;
      if (line.trim() === '') continue;
      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent <= indent) break;
      end = j;
    }
    units.push({ name: m[2]!, file, line: i + 1, body: lines.slice(i, end + 1).join('\n') });
    i = end;
  }
  return units;
}
