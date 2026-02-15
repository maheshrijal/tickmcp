import { CodeBlock } from './CodeBlock';

const BASE_URL = '__BASE_URL__';
const ONBOARDING_ITEMS = [
  { name: 'Codex', snippet: `codex mcp add tickmcp --url ${BASE_URL}/mcp` },
  { name: 'Claude Code', snippet: `claude mcp add tickmcp --transport http ${BASE_URL}/mcp` },
  {
    name: 'Claude Desktop / Cursor',
    snippet: `{
  "mcpServers": {
    "tickmcp": {
      "type": "streamableHttp",
      "url": "${BASE_URL}/mcp"
    }
  }
}`,
  },
];

export function QuickOnboarding() {
  return (
    <section className="page-section" id="get-started">
      <h2 className="section-label">Get Started</h2>
      <div className="setup-list">
        {ONBOARDING_ITEMS.map((item) => (
          <div key={item.name} className="setup-item">
            <div className="setup-header">
              <span className="setup-name">{item.name}</span>
            </div>
            <CodeBlock>{item.snippet}</CodeBlock>
          </div>
        ))}

        <div className="setup-item">
          <div className="setup-header">
            <span className="setup-name">ChatGPT / Claude</span>
          </div>
          <p className="setup-desc">Add as a remote MCP server with this URL:</p>
          <CodeBlock>{`${BASE_URL}/mcp`}</CodeBlock>
        </div>
      </div>
    </section>
  );
}
