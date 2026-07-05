# Project instructions

My own notes stay put.

<!-- dejavu:begin -->
## Project decisions (DejaVu)

Binding decisions for this repository — do not contradict them.
Full history in DECISIONS.md. Managed block: edit with `dejavu`, not by hand.

- **D-002: RLS plus edge-function checks for admin routes**
  - rule: RLS everywhere; admin routes additionally verify the caller in the edge function
  - why: admin panel needs service-role queries that bypass RLS
  - applies to: src/api/**
- **D-003: Use pnpm, never npm**
  - rule: pnpm for all package operations
<!-- dejavu:end -->

Trailing user text after the block.
