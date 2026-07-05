# Decisions

Architectural and product decisions for this repository, kept by [DejaVu](https://github.com/arunkt/dejavu).
Agents and humans: treat `status: active` entries as binding. Changes append a superseding entry — history stays.

## D-001: Use Supabase RLS for authorization (not API-layer checks)
- date: 2026-07-04 · source: claude-code session · status: superseded
- context: single-tenant app, auth bugs from duplicated API checks
- rule: all authorization goes through RLS policies; no manual user_id filtering in API routes
- applies_to: src/api/**, supabase/**
- detect: user_id\s*===?
- superseded-by: D-002

## D-002: RLS plus edge-function checks for admin routes
- date: 2026-07-05 · source: manual · status: active
- context: admin panel needs service-role queries that bypass RLS
- rule: RLS everywhere; admin routes additionally verify the caller in the edge function
- supersedes: D-001
