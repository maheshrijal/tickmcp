export function Trust() {
  return (
    <section className="page-section" id="trust">
      <h2 className="section-label">Trust, Security, and Operating Model</h2>
      <div className="trust-grid">
        <article className="trust-card">
          <h3>Built For Real Teams</h3>
          <p>
            tickmcp is designed for teams that run daily planning and execution through MCP
            clients. The service exposes a compact TickTick API surface, prioritizes predictable
            behavior, and keeps integration steps straightforward so engineers can move quickly.
          </p>
          <p>
            Every integration path shown on this page points to the same endpoint contract. That
            keeps onboarding simple across Codex, Claude, Cursor, and other remote MCP clients.
          </p>
        </article>
        <article className="trust-card">
          <h3>Auth and Session Safety</h3>
          <p>
            Authentication is handled through OAuth with explicit user consent. Tokens are scoped,
            session material is stored server-side, and transport headers are hardened to reduce
            accidental leakage through browsers or intermediate systems.
          </p>
          <p>
            The worker is deployed on Cloudflare infrastructure and tuned for dependable endpoint
            behavior, including strict request routing for OAuth and MCP paths.
          </p>
        </article>
        <article className="trust-card">
          <h3>Transparent Project Operations</h3>
          <p>
            This project is open source and maintained in public. The docs, release history, and
            implementation details are available in the GitHub repository, which makes it easier to
            review changes, audit behavior, and contribute improvements.
          </p>
          <p>
            For operational and legal context, review the About, Contact, and Privacy pages linked
            below.
          </p>
        </article>
      </div>
    </section>
  );
}
