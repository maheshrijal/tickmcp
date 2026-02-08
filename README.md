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
| `ticktick_list_tasks` | List tasks with filters (project, status, due date) and pagination |
| `ticktick_get_task` | Get a task by ID |
| `ticktick_create_task` | Create a task |
| `ticktick_update_task` | Update a task |
| `ticktick_complete_task` | Mark a task complete |
| `ticktick_delete_task` | Delete a task |

Mutating tools require an `idempotencyKey` to safely deduplicate retries.

## Architecture

```
MCP Client ←(OAuth 2.1)→ tickmcp ←(OAuth 2.0)→ TickTick API
```

- **Runtime**: Cloudflare Workers
- **Transport**: Streamable HTTP (`POST /mcp`)
- **Auth**: OAuth 2.1 with consent screen + PKCE, proxying to TickTick OAuth 2.0
- **Storage**: D1 (users, audit events, OAuth state) + KV (tokens, idempotency)
- **Rate limiting**: Per-user via Cloudflare Rate Limiting

## Development

```bash
npm install
npm run db:migrate        # local D1 migrations
npm run dev               # local dev server
npm run check             # typecheck
npm run test              # run tests
```

Secrets setup: `docs/SECRETS_SETUP_FISH.md`

### Deploy

```bash
npm run deploy              # dev (tickmcp-dev.mrjl.dev)
npm run deploy:production   # prod (tickmcp.mrjl.dev)
```

### TickTick OAuth Apps

Create two apps at <https://developer.ticktick.com/manage>:

| Environment | Redirect URI |
|-------------|-------------|
| Dev | `https://tickmcp-dev.mrjl.dev/callback` |
| Production | `https://tickmcp.mrjl.dev/callback` |

Scope: `tasks:read tasks:write`

### Source Layout

```
src/index.ts                     Worker entrypoint (OAuthProvider + McpAgent)
src/auth/                        OAuth authorize/callback + TickTick token helpers
src/ticktick/client.ts           TickTick API client with retry/refresh
src/mcp/tools/register-tools.ts  MCP tool definitions and handlers
src/db/                          D1 schema, migrations, repositories
src/security/idempotency.ts      Idempotency guard
test/                            Unit and integration tests
```

## License

[MIT](LICENSE)
