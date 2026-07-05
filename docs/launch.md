# Launch plan

## The story (lead with this everywhere)

Month 3 is where vibecoded projects go to die. Features start breaking other
features. The cause has a shape: **your AI doesn't remember its own decisions.**
Every session starts fresh; "why did we choose RLS over API checks?" was
decided three weeks ago in a different tool and is now invisible, so today's
session quietly contradicts it — and rewrites `slugify()` for the fourth time
(8x more duplication than human codebases, per the studies the PR-bot vendors
cite). DejaVu is how your project survives month 3.

## Show HN

> **Show HN: DejaVu – my coding agents kept rewriting code they'd already
> written, so I gave my repo a memory**
>
> Every AI coding session starts fresh. Mine kept re-implementing helpers that
> already existed and contradicting decisions we'd made weeks earlier in other
> tools. DejaVu mines decisions from your Claude Code/Cursor sessions into a
> DECISIONS.md that travels with git clone, projects them into every agent's
> context (CLAUDE.md, AGENTS.md, .cursorrules, MCP), and enforces them — a
> pre-commit hook that says "⚠ your AI already wrote this — utils/text.ts:42".
> Local, free, Apache-2.0, no cloud, no accounts. `npx dejavu-dev init`

First comment (self): the honest-limitations comment — heuristic mining not
LLM-perfect, JS/TS/Python duplication only, what's next. HN rewards it.

## Reddit (r/ClaudeAI, r/cursor, r/vibecoding)

Lead with the Spaghetti Point story, not features. Template:

> Hit month 3 on my side project and everything started breaking everything.
> Dug in and found FOUR implementations of the same date formatter, each from
> a different session. The kicker: session 41 had *decided* "all dates in UTC,
> timestamptz" — sessions 42+ never saw that decision. So I built a tool that
> [one GIF]. It's free/local/OSS. Roast it.

## Blog posts

1. **"The Spaghetti Point: why vibecoded projects die at month 3"** — data-led
   (duplication stats, the PainIndex pain ranking), ends with the tool. This is
   the SEO anchor; publish before Show HN, link from it.
2. **"Your agents each know a different why"** — the cross-tool memory
   argument: repo layer travels with clone, vendors won't build this because
   portability fights lock-in.

## The score loop

`dejavu score --badge` → `![DejaVu score](./dejavu-score.svg)` in the README.
Every badge is an ad; "My repo scores B-. What's yours?" is the tweet. Score
screenshots are self-contained (grade + bars) — designed to be posted.

## Standards positioning

Propose the decision-block format as a companion to AGENTS.md in the standards
discussions (agents.md repo, MCP community). Reference AgDR respectfully:
DejaVu is "AgDR with automation and teeth" — same insight (decisions need to
live with the repo), plus mining, projection, and enforcement so it works
without human discipline. Being the proposal in the room is the moat.

## Good first issues (create on GitHub at launch)

Each pre-created with the adapter guide linked and the fixture path named:

1. **Windsurf adapter** (`.windsurfrules`) — good-first-issue, ~40 lines
2. **Gemini CLI adapter** (`GEMINI.md`) — good-first-issue, ~40 lines
3. **Zed adapter** (`.rules`) — good-first-issue, ~40 lines
4. **JetBrains AI adapter** (`.junie/guidelines.md`) — good-first-issue
5. **Better mining heuristics** — add a pattern + precision tests to
   `src/mining/heuristics.ts`; the noise table in `tests/heuristics.test.ts`
   is the gate
6. **Aider adapter + session mining** (`.aider.conf.yml`, chat history files)

## Launch-week checklist

- [ ] Publish `dejavu-dev` to npm (`npm publish`), tag v0.1.0
- [ ] Petition npm support for the abandoned `dejavu` name (last publish 2014)
- [ ] Record hero GIF (script: docs/hero-gif.md), < 45s, README top
- [ ] Blog post 1 live; Show HN morning US-Pacific, Tue–Thu
- [ ] Create the 6 good-first-issues
- [ ] `dejavu score` badge on DejaVu's own README (dogfood, obviously)
