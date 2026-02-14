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
      <div className="endpoint" role="status" aria-label="MCP endpoint URL">
        <span className="endpoint-badge" aria-hidden="true">POST</span>
        <code>{BASE_URL}/mcp</code>
      </div>
    </section>
  );
}
