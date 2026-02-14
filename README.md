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
| `ticktick_create_project` | Create a project |
| `ticktick_update_project` | Update a project |
| `ticktick_list_tasks` | List tasks with filters (project, status, due date) and pagination |
| `ticktick_get_task` | Get a task by ID |
| `ticktick_create_task` | Create a task (supports recurrence and checklist items) |
| `ticktick_update_task` | Update a task (supports recurrence and checklist items) |
| `ticktick_complete_task` | Mark a task complete |
| `ticktick_delete_task` | Delete a task |

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
