type ToolItem = {
  label: string;
  tone: 'green' | 'blue' | 'orange';
};

const AUTH_TOOLS: ToolItem[] = [{ label: 'ticktick_auth_status()', tone: 'green' }];

const PROJECT_TOOLS: ToolItem[] = [
  { label: 'ticktick_list_projects()', tone: 'green' },
  { label: 'ticktick_get_project()', tone: 'green' },
  { label: 'ticktick_create_project()', tone: 'blue' },
  { label: 'ticktick_update_project()', tone: 'blue' },
];

const TASK_TOOLS: ToolItem[] = [
  { label: 'ticktick_list_tasks()', tone: 'green' },
  { label: 'ticktick_get_task()', tone: 'green' },
  { label: 'ticktick_create_task(repeat?, items?)', tone: 'blue' },
  { label: 'ticktick_update_task(repeat?, items?)', tone: 'blue' },
  { label: 'ticktick_complete_task()', tone: 'orange' },
  { label: 'ticktick_delete_task()', tone: 'orange' },
];

const ENDPOINTS = [
  { method: 'POST', path: '/mcp' },
  { method: 'GET', path: '/authorize' },
  { method: 'GET', path: '/callback' },
  { method: 'POST', path: '/token' },
  { method: 'POST', path: '/register' },
] as const;

const ROADMAP = ['Project delete', 'Tags', 'Habits', 'Webhooks', 'Calendar'] as const;

function ToolList({ items }: { items: ToolItem[] }) {
  return (
    <ul className="tool-list">
      {items.map((item) => (
        <li key={item.label}>
          <span className={`tool-dot dot-${item.tone}`} aria-hidden="true" />
          <code>{item.label}</code>
        </li>
      ))}
    </ul>
  );
}

export function SupportedTools() {
  return (
    <section className="page-section" id="api-surface">
      <h2 className="section-label">API Surface</h2>

      <div className="tools-columns">
        <div>
          <div className="tool-group">
            <h3>Auth</h3>
            <ToolList items={AUTH_TOOLS} />
          </div>

          <div className="tool-group tool-group--spaced">
            <h3>Projects</h3>
            <ToolList items={PROJECT_TOOLS} />
          </div>
        </div>

        <div className="tool-group">
          <h3>Tasks</h3>
          <ToolList items={TASK_TOOLS} />
        </div>

        <div>
          <div className="tool-group">
            <h3>HTTP Endpoints</h3>
            <table className="endpoint-table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Path</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map((endpoint) => (
                  <tr key={`${endpoint.method}:${endpoint.path}`}>
                    <td>
                      <span className={`method-badge ${endpoint.method === 'POST' ? 'badge-post' : 'badge-get'}`}>
                        {endpoint.method}
                      </span>
                    </td>
                    <td><code>{endpoint.path}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="roadmap" aria-label="Planned features">
            {ROADMAP.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
