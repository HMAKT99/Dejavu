# Decisions

## D-001: Use Supabase RLS for authorization
- date: 2026-07-04 · source: claude-code session · status: superseded
- rule: all authorization goes through RLS policies
- superseded-by: D-002

## D-002: RLS plus edge-function checks for admin routes
- date: 2026-07-05 · source: manual · status: active
- context: admin panel needs service-role queries that bypass RLS
- rule: RLS everywhere; admin routes additionally verify the caller in the edge function
- applies_to: src/api/**
- supersedes: D-001

## D-003: Use pnpm, never npm
- date: 2026-07-05 · source: manual · status: active
- rule: pnpm for all package operations
