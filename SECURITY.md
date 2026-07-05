# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | ✔ |

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Instead:

- Use GitHub's private reporting: **Security → Report a vulnerability** on this repo, or
- Email **arunkt.bm14@gmail.com** with details and a reproduction.

You'll get an acknowledgement within 72 hours. Fixes ship as patch releases and
are credited in the changelog unless you prefer otherwise.

## Scope notes for reporters

Areas we consider security-relevant in a local-first tool:

- **File-write safety**: any way to make DejaVu write outside a managed block,
  outside the repo/machine-layer boundaries, or to lose ledger content.
- **Untrusted repo input**: `DECISIONS.md` arrives via `git clone` — its
  `detect:` regexes are executed (bounded to 1,000 chars/line by design) and
  its content is parsed. Bypassing those bounds is in scope.
- **The machine layer**: anything that leaks `~/.dejavu` (personal context)
  into a repository working tree or commit.

DejaVu makes no network calls at runtime and collects no data — reports about
telemetry/exfiltration would therefore be highest severity.
