# Hero GIF script (< 45 seconds)

The GIF defines the product. Two beats: the save, then the magic.

**Setup (off-screen):** `examples/spaghetti-app` cloned to `~/demo`, DejaVu
initialized, decisions present, pre-commit hook installed. Terminal 100×30,
large font, dark theme.

## Beat 1 — "Your AI already wrote this" (0:00–0:20)

1. `cat lib/new-feature.ts` — 6 lines: an agent just wrote `toSlug()`
   (a slugify clone). (2s)
2. `git add -A && git commit -m "add slug helper"` (2s)
3. Pre-commit fires:
   `⚠ duplicate  toSlug() looks 98% like slugify() in utils/text.ts:6`
   `  your AI already wrote this — reuse it instead` (hold 4s)
4. Commit goes through anyway — caption: "warns, never blocks (until --strict)". (2s)

## Beat 2 — the money shot: one memory, every agent (0:20–0:42)

5. `dejavu remember "use pnpm, never npm" --rule "pnpm for all package ops"` (3s)
6. Output shows `✔ D-005 recorded` + `✔ CLAUDE.md — managed block refreshed`
   `✔ .cursorrules — managed block refreshed` (3s)
7. Split screen or quick cut: `tail -8 .cursorrules` — the decision is there.
   Caption: **"Claude Code decided. Cursor already knows."** (5s)
8. Final card (3s):
   `git clone` = memory included · local · free · Apache-2.0
   `npx dejavu-dev init`

Record with vhs (charmbracelet) so it's reproducible: `docs/hero.tape`.
