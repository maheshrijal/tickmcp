const BASE_URL = '__BASE_URL__';

export function Hero() {
  return (
    <section className="hero">
      <div className="hero-content">
        <div className="hero-eyebrow">
          <span className="hero-dot" aria-hidden="true" />
          <span>Live on Cloudflare Workers</span>
        </div>
        <h1>
          Manage <a href="https://ticktick.com">TickTick</a><br />
          with <em>any MCP client</em>
        </h1>
        <p className="hero-sub">
          A remote, multi-user MCP server for TickTick. OAuth is handled automatically &mdash; connect with a single endpoint.
        </p>
        <p className="hero-sub">
          Designed for practical daily use, tickmcp keeps setup compact while exposing the project and task operations teams
          actually need.
        </p>
        <div className="endpoint" role="status" aria-label="MCP endpoint URL">
          <span className="endpoint-badge" aria-hidden="true">POST</span>
          <code>{BASE_URL}/mcp</code>
        </div>
        <p className="hero-meta">
          Maintained by <a href="https://maheshrijal.com/">Mahesh Rijal</a>
        </p>
      </div>

      <div className="hero-terminal-wrap" aria-hidden="true">
        <div className="terminal">
          <div className="terminal-bar">
            <span className="terminal-btn terminal-btn-r" />
            <span className="terminal-btn terminal-btn-y" />
            <span className="terminal-btn terminal-btn-g" />
            <span className="terminal-label">tickmcp · MCP Session</span>
          </div>
          <div className="terminal-body">
            <div className="terminal-line">
              <span className="terminal-prompt">$</span>
              <span className="terminal-cmd"> claude mcp add tickmcp \</span>
            </div>
            <div className="terminal-line">
              <span className="terminal-dim">{'    '}--transport http \</span>
            </div>
            <div className="terminal-line">
              <span className="terminal-dim">{'    '}tickmcp.mrjl.dev/mcp</span>
            </div>
            <span className="terminal-blank" />
            <div className="terminal-line"><span className="terminal-success">✓</span><span className="terminal-cmd"> OAuth authorized</span></div>
            <div className="terminal-line"><span className="terminal-success">✓</span><span className="terminal-cmd"> 14 tools registered</span></div>
            <span className="terminal-blank" />
            <div className="terminal-line">
              <span className="terminal-prompt">{'>'}</span>
              <span className="terminal-cmd">{' list_tasks({ dueFilter: "today" })'}</span>
            </div>
            <span className="terminal-blank" />
            <div className="terminal-task">
              <span className="terminal-task-dot-active">◉</span>
              <span className="terminal-task-title">Review Q1 goals</span>
              <span className="terminal-priority-high">↑ HIGH</span>
            </div>
            <div className="terminal-task">
              <span className="terminal-task-dot-active">◉</span>
              <span className="terminal-task-title">Send standup notes</span>
              <span className="terminal-priority-med">MED</span>
            </div>
            <div className="terminal-task">
              <span className="terminal-task-dot-open">○</span>
              <span className="terminal-task-title">Plan sprint board</span>
              <span className="terminal-priority-med">MED</span>
            </div>
            <hr className="terminal-divider" />
            <div className="terminal-line terminal-count">3 tasks due today<span className="terminal-cursor" /></div>
          </div>
        </div>
      </div>
    </section>
  );
}
