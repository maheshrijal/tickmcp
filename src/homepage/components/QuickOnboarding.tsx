import { CodeBlock } from './CodeBlock';

const BASE_URL = '__BASE_URL__';

export function QuickOnboarding() {
  return (
    <section className="page-section" id="get-started">
      <h2 className="section-label">Get Started</h2>
      <div className="setup-list">
        <div className="setup-item">
          <div className="setup-header">
            <span className="setup-name">Codex</span>
          </div>
          <CodeBlock>{`codex mcp add tickmcp --url ${BASE_URL}/mcp`}</CodeBlock>
        </div>

        <div className="setup-item">
          <div className="setup-header">
            <span className="setup-name">Claude Code</span>
          </div>
          <CodeBlock>{`claude mcp add tickmcp --transport http ${BASE_URL}/mcp`}</CodeBlock>
        </div>

        <div className="setup-item">
          <div className="setup-header">
            <span className="setup-name">Claude Desktop / Cursor</span>
          </div>
          <CodeBlock>{`{
  "mcpServers": {
    "tickmcp": {
      "type": "streamableHttp",
      "url": "${BASE_URL}/mcp"
    }
  }
}`}</CodeBlock>
        </div>

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
