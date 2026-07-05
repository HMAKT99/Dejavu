# MCP server

`dejavu serve` exposes the decision ledger to any MCP-speaking agent over
stdio. New tools are supported the day they speak MCP.

## Tools

| Tool | What it does |
|---|---|
| `search_decisions` | Keyword search over the ledger; active decisions ranked first |
| `get_decision` | Full markdown block for one ID (`D-014`) |
| `check_against_decisions` | Check a code snippet BEFORE writing it: contradictions + duplicates |
| `list_active_decisions` | Every binding decision, compact |

## Claude Code

```bash
claude mcp add dejavu -- npx dejavu-dev serve
```

or in `.mcp.json` (committed — the whole team's agents get it):

```json
{
  "mcpServers": {
    "dejavu": { "command": "npx", "args": ["--yes", "dejavu-dev", "serve"] }
  }
}
```

## Cursor

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "dejavu": { "command": "npx", "args": ["--yes", "dejavu-dev", "serve"] }
  }
}
```

The server reads `DECISIONS.md` fresh on every call, so agents always see the
current ledger — no restart after `dejavu remember`.

## Real-time enforcement (Claude Code hook)

For warnings *while the agent works*, add a PostToolUse hook to
`.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "dejavu check \"$CLAUDE_FILE_PATHS\"" }]
      }
    ]
  }
}
```

Every file the agent writes is checked the moment it lands; findings appear in
the agent's own context, so it can fix them before you ever see the diff.
