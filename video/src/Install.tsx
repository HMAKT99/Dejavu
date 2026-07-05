import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * DejaVu install walkthrough (~26s):
 *   title → npx init → remember a decision → check catches a duplicate → CTA.
 * Pure data-driven terminal simulation; no external assets, no network.
 */

export const FPS = 30;

const MONO = 'Menlo, "SF Mono", Consolas, monospace';
const SANS = '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

const C = {
  bg: '#0b0e14',
  chrome: '#1c2128',
  text: '#d6dde6',
  dim: '#8b949e',
  green: '#3fb950',
  yellow: '#d29922',
  red: '#f85149',
  cyan: '#39c5cf',
  accent: '#a371f7',
};

type Line = {
  /** 'cmd' lines type out char by char; 'out' lines appear at once. */
  kind: 'cmd' | 'out';
  text: string;
  color?: string;
  bold?: boolean;
  /** Frame at which this line starts. */
  at: number;
  /** Chars per frame while typing (cmd only). */
  cps?: number;
};

const TYPE_SPEED = 1.6;

// ---- The script -----------------------------------------------------------

const TITLE_END = 70;

let cursor = TITLE_END + 10;
const lines: Line[] = [];
const cmd = (text: string, holdAfter = 0) => {
  lines.push({ kind: 'cmd', text, at: cursor, cps: TYPE_SPEED });
  cursor += Math.ceil(text.length / TYPE_SPEED) + 12 + holdAfter;
};
const out = (text: string, color?: string, bold = false, gap = 4) => {
  lines.push({ kind: 'out', text, color: color ?? C.text, bold, at: cursor });
  cursor += gap;
};
const pause = (frames: number) => {
  cursor += frames;
};

cmd('npx dejavu-dev init');
out('✔ created DECISIONS.md', C.green);
out('✔ created .dejavu/index.json', C.green);
out('✔ pre-commit hook installed (warn-only)', C.green);
pause(28);

cmd('npx dejavu-dev remember "Use Supabase RLS for authorization" \\');
lines[lines.length - 1]!.cps = 2.4;
out('      --rule "no manual user_id filtering in API routes"', C.text, false, 10);
out('## D-001: Use Supabase RLS for authorization', C.cyan, true);
out('- date: 2026-07-05 · source: manual · status: active', C.dim);
out('- rule: no manual user_id filtering in API routes', C.dim);
out('✔ D-001 recorded — CLAUDE.md + .cursorrules refreshed', C.green, false, 8);
pause(34);

cmd('npx dejavu-dev check');
out('⚠ duplicate  src/api/posts.ts:1', C.yellow, true);
out('  makeUrlSlug() looks 98% like slugify() in utils/text.ts:2', C.text);
out('  your AI already wrote this — reuse it instead', C.dim, false, 8);
out('⚠ D-001  src/api/posts.ts:9 — manual user_id filtering', C.yellow, true, 8);
out('2 finding(s) — warnings only (use --strict to block)', C.dim);
pause(40);

const TERMINAL_END = cursor;
const CTA_LEN = 110;
export const INSTALL_DURATION = TERMINAL_END + CTA_LEN;

// ---- Components -----------------------------------------------------------

const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = spring({ frame, fps, config: { damping: 14 } });
  const fadeOut = interpolate(frame, [TITLE_END - 12, TITLE_END], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (frame > TITLE_END) return null;
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        opacity: fadeOut,
        zIndex: 2,
        backgroundColor: C.bg,
      }}
    >
      <div style={{ transform: `scale(${appear})`, textAlign: 'center', fontFamily: SANS }}>
        <div style={{ fontSize: 130, fontWeight: 800, color: C.text, letterSpacing: -3 }}>
          Deja<span style={{ color: C.accent }}>Vu</span>
        </div>
        <div style={{ fontSize: 44, color: C.dim, marginTop: 18 }}>
          Your AI already wrote this.
        </div>
        <div style={{ fontSize: 30, color: C.dim, marginTop: 40, fontFamily: MONO }}>
          give your repo a memory — in 30 seconds
        </div>
      </div>
    </AbsoluteFill>
  );
};

const TerminalLine: React.FC<{ line: Line; frame: number }> = ({ line, frame }) => {
  if (frame < line.at) return null;
  let text = line.text;
  if (line.kind === 'cmd') {
    const chars = Math.min(text.length, Math.floor((frame - line.at) * (line.cps ?? TYPE_SPEED)));
    const typing = chars < text.length;
    text = text.slice(0, chars);
    return (
      <div style={{ whiteSpace: 'pre-wrap' }}>
        <span style={{ color: C.accent, fontWeight: 700 }}>{'❯ '}</span>
        <span style={{ color: C.text, fontWeight: 600 }}>{text}</span>
        {typing ? <span style={{ color: C.text }}>▌</span> : null}
      </div>
    );
  }
  const reveal = interpolate(frame, [line.at, line.at + 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        whiteSpace: 'pre-wrap',
        color: line.color,
        fontWeight: line.bold ? 700 : 400,
        opacity: reveal,
      }}
    >
      {text}
    </div>
  );
};

const Terminal: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < TITLE_END - 12 || frame > TERMINAL_END + 20) return null;
  const slideIn = interpolate(frame, [TITLE_END - 12, TITLE_END + 8], [40, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(frame, [TERMINAL_END, TERMINAL_END + 18], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // Keep the newest lines in view: scroll when content exceeds the window.
  const visible = lines.filter((l) => frame >= l.at).length;
  const scroll = Math.max(0, visible - 14) * 46;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div
        style={{
          width: 1560,
          height: 840,
          transform: `translateY(${slideIn}px)`,
          backgroundColor: C.chrome,
          borderRadius: 18,
          boxShadow: '0 30px 90px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', gap: 10, padding: '18px 22px', alignItems: 'center' }}>
          <div style={{ width: 16, height: 16, borderRadius: 8, background: '#ff5f57' }} />
          <div style={{ width: 16, height: 16, borderRadius: 8, background: '#febc2e' }} />
          <div style={{ width: 16, height: 16, borderRadius: 8, background: '#28c840' }} />
          <div style={{ color: C.dim, fontFamily: MONO, fontSize: 22, marginLeft: 16 }}>
            your-project — zsh
          </div>
        </div>
        <div
          style={{
            backgroundColor: C.bg,
            height: '100%',
            padding: '30px 40px',
            fontFamily: MONO,
            fontSize: 30,
            lineHeight: '46px',
            overflow: 'hidden',
          }}
        >
          <div style={{ transform: `translateY(-${scroll}px)` }}>
            {lines.map((line, i) => (
              <TerminalLine key={`${line.at}-${i}`} line={line} frame={frame} />
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < TERMINAL_END + 10) return null;
  const local = frame - (TERMINAL_END + 10);
  const appear = spring({ frame: local, fps, config: { damping: 15 } });
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: C.bg,
        zIndex: 2,
      }}
    >
      <div style={{ transform: `scale(${appear})`, textAlign: 'center' }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 64,
            color: C.text,
            backgroundColor: C.chrome,
            padding: '28px 54px',
            borderRadius: 16,
            border: `2px solid ${C.accent}`,
          }}
        >
          <span style={{ color: C.accent }}>❯</span> npx dejavu-dev init
        </div>
        <div style={{ fontFamily: SANS, fontSize: 34, color: C.dim, marginTop: 44 }}>
          one memory, every coding agent · local · free · Apache-2.0
        </div>
        <div style={{ fontFamily: MONO, fontSize: 28, color: C.dim, marginTop: 20 }}>
          github.com/HMAKT99/Dejavu
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Install: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.bg }}>
    <Terminal />
    <TitleCard />
    <EndCard />
  </AbsoluteFill>
);
