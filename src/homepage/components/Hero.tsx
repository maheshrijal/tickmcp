const BASE_URL = '__BASE_URL__';

export function Hero() {
  return (
    <section className="hero">
      <div className="hero-eyebrow">
        <span className="hero-dot" aria-hidden="true" />
        <span>Live on Cloudflare Workers</span>
      </div>
      <h1>
        Manage TickTick<br />
        with <em>any MCP client</em>
      </h1>
      <p className="hero-sub">
        A remote, multi-user MCP server for TickTick. OAuth is handled automatically &mdash; connect with a single endpoint.
      </p>
      <p className="hero-sub">
        Designed for practical daily use, tickmcp keeps setup compact while exposing the project and task operations teams
        actually need. The service is built for reliability under real workload patterns, not demo traffic, so client
        integrations remain stable across repeated task fetches, updates, and completions.
      </p>
      <div className="endpoint" role="status" aria-label="MCP endpoint URL">
        <span className="endpoint-badge" aria-hidden="true">POST</span>
        <code>{BASE_URL}/mcp</code>
      </div>
    </section>
  );
}
