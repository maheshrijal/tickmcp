# tickmcp

Remote multi-user [TickTick](https://ticktick.com) MCP server on Cloudflare Workers.

Streamable HTTP transport · OAuth 2.1 · Structured output

## Connect

MCP endpoint: `https://tickmcp.mrjl.dev/mcp`

```bash
# Claude Code
claude mcp add tickmcp --transport http https://tickmcp.mrjl.dev/mcp

# Codex
codex mcp add tickmcp --url https://tickmcp.mrjl.dev/mcp
```

<details>
<summary>Claude Desktop / Cursor</summary>

```json
{
  "mcpServers": {
    "tickmcp": {
      "type": "streamableHttp",
      "url": "https://tickmcp.mrjl.dev/mcp"
    }
  }
}
```
</details>

ChatGPT — add as remote MCP server URL: `https://tickmcp.mrjl.dev/mcp`

## Tools

| Tool | Description |
|------|-------------|
| `ticktick_auth_status` | Check TickTick connection status |
| `ticktick_list_projects` | List all projects |
| `ticktick_get_project` | Get a project by ID |
| `ticktick_create_project` | Create a project (supports `viewMode`, `sortOrder`, `kind`) |
| `ticktick_update_project` | Update a project (supports `viewMode`, `sortOrder`, `kind`) |
| `ticktick_delete_project` | Permanently delete a project |
| `ticktick_get_project_data` | Get project + undone tasks + columns envelope |
| `ticktick_list_tasks` | List active tasks with filters (project, `status=0`, due date, range, priority, sort) and pagination |
| `ticktick_get_task` | Get a task by ID |
| `ticktick_create_task` | Create a task (supports `repeat`/`repeatFlag`, reminders, checklist items, timezone/all-day, task kind) |
| `ticktick_update_task` | Update a task (supports `repeat`/`repeatFlag`, reminders, checklist items, timezone/all-day, task kind) |
| `ticktick_patch_task_items` | Patch checklist items deterministically (`add`/`update`/`remove`/`toggle`) |
| `ticktick_complete_task` | Mark a task complete |
| `ticktick_delete_task` | Delete a task |

## Current Limitation

- `ticktick_list_tasks` intentionally supports active tasks only. `status=2` (completed listing) is explicitly unsupported and returns `VALIDATION_ERROR`.

## Architecture

```
MCP Client ←(OAuth 2.1)→ tickmcp ←(OAuth 2.0)→ TickTick API
```

- **Runtime**: Cloudflare Workers
- **Transport**: Streamable HTTP (`POST /mcp`)
- **Auth**: OAuth 2.1 with consent screen + PKCE, proxying to TickTick OAuth 2.0
- **Storage**: D1 (users, audit events, OAuth state) + KV (tokens, idempotency)
- **Rate limiting**: Per-user via Cloudflare Rate Limiting

## License

[MIT](LICENSE)
