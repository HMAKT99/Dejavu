# My project decisions

## D-001: use pnpm, never npm
- date: 2026-06-01 · source: manual · status: active
- rule: pnpm for all package operations
- applies_to: package.json, pnpm-lock.yaml

Some trailing prose a human added after the bullets.
It should survive verbatim.

## D-2: All dates in UTC
- date: 2026-06-02 · source: claude-code session, pair review · status: active
- rule: store timestamptz, render in the user's locale only at the edge
