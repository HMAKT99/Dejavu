# spaghetti-app

A deliberately messy month-3 vibecoded app, frozen at the moment the Spaghetti
Point hits. Use it to see every DejaVu feature fire without setting anything up:

```bash
cd examples/spaghetti-app
git init -q && git add -A && git commit -qm "month 3"   # give it a git history

npx dejavu-dev check --all     # ⚠ D-002 contradiction in app/api/orders/route.ts
                               # ⚠ makeUrlSlug() duplicates slugify()
                               # ⚠ prettyDate() duplicates formatDate()
npx dejavu-dev score           # spoiler: it is not an A
npx dejavu-dev project --all   # CLAUDE.md / AGENTS.md / .cursorrules get the decisions
npx dejavu-dev review          # (queue is empty until you mine or --queue something)
```

What's planted:

- `DECISIONS.md` — four decisions, one superseded (the history is the point)
- `app/api/orders/route.ts` — contradicts **D-002** (manual `user_id` filtering)
- `lib/helpers.ts` — re-implements `slugify()` and `formatDate()` from `utils/`
  under new names, the classic AI-with-no-memory move
- `app/api/users/route.ts` — a compliant route, so not everything screams
