# Decisions

Architectural and product decisions for this repository, kept by [DejaVu](https://github.com/arunkt/dejavu).
Agents and humans: treat `status: active` entries as binding. Changes append a superseding entry — history stays.

## D-001: Use API-layer authorization checks
- date: 2026-04-02 · source: claude-code session · status: superseded
- context: quick MVP, auth logic lives in each route handler
- rule: every API route filters rows by user_id manually
- superseded-by: D-002

## D-002: Use Supabase RLS for authorization (not API-layer checks)
- date: 2026-05-11 · source: claude-code session · status: active
- context: month 2 — three auth bugs traced to routes that forgot the user_id filter
- rule: all authorization goes through RLS policies; no manual user_id filtering in API routes
- applies_to: app/api/**
- detect: user_id\s*===?
- supersedes: D-001

## D-003: All dates in UTC, stored as timestamptz
- date: 2026-05-18 · source: manual · status: active
- context: a Berlin user saw tomorrow's invoices
- rule: store timestamptz; format in the user's locale only at render time
- detect: new Date\(\)\.toLocaleDateString\(\)

## D-004: Use date-fns, never moment.js
- date: 2026-06-01 · source: cursor session · status: active
- context: bundle went from 180KB to 460KB when moment snuck in
- rule: date-fns only; moment is banned
- detect: from ['"]moment|require\(['"]moment
