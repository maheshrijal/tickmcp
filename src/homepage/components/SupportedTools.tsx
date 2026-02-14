export function SupportedTools() {
  return (
    <section className="page-section">
      <h2 className="section-label">API Surface</h2>

      <div className="tools-columns">
        {/* Column 1: Auth + Projects */}
        <div>
          <div className="tool-group">
            <h3>Auth</h3>
            <ul className="tool-list">
              <li>
                <span className="tool-dot dot-green" aria-hidden="true" />
                <code>ticktick_auth_status()</code>
              </li>
            </ul>
          </div>

          <div className="tool-group tool-group--spaced">
            <h3>Projects</h3>
            <ul className="tool-list">
              <li>
                <span className="tool-dot dot-green" aria-hidden="true" />
                <code>ticktick_list_projects()</code>
              </li>
              <li>
                <span className="tool-dot dot-green" aria-hidden="true" />
                <code>ticktick_get_project()</code>
              </li>
              <li>
                <span className="tool-dot dot-blue" aria-hidden="true" />
                <code>ticktick_create_project()</code>
              </li>
              <li>
                <span className="tool-dot dot-blue" aria-hidden="true" />
                <code>ticktick_update_project()</code>
              </li>
            </ul>
          </div>
        </div>

        {/* Column 2: Tasks */}
        <div className="tool-group">
          <h3>Tasks</h3>
          <ul className="tool-list">
            <li>
              <span className="tool-dot dot-green" aria-hidden="true" />
              <code>ticktick_list_tasks()</code>
            </li>
            <li>
              <span className="tool-dot dot-green" aria-hidden="true" />
              <code>ticktick_get_task()</code>
            </li>
            <li>
              <span className="tool-dot dot-blue" aria-hidden="true" />
              <code>ticktick_create_task(repeat?, items?)</code>
            </li>
            <li>
              <span className="tool-dot dot-blue" aria-hidden="true" />
              <code>ticktick_update_task(repeat?, items?)</code>
            </li>
            <li>
              <span className="tool-dot dot-orange" aria-hidden="true" />
              <code>ticktick_complete_task()</code>
            </li>
            <li>
              <span className="tool-dot dot-orange" aria-hidden="true" />
              <code>ticktick_delete_task()</code>
            </li>
          </ul>
        </div>

        {/* Column 3: Endpoints */}
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
                <tr>
                  <td><span className="method-badge badge-post">POST</span></td>
                  <td><code>/mcp</code></td>
                </tr>
                <tr>
                  <td><span className="method-badge badge-get">GET</span></td>
                  <td><code>/authorize</code></td>
                </tr>
                <tr>
                  <td><span className="method-badge badge-get">GET</span></td>
                  <td><code>/callback</code></td>
                </tr>
                <tr>
                  <td><span className="method-badge badge-post">POST</span></td>
                  <td><code>/token</code></td>
                </tr>
                <tr>
                  <td><span className="method-badge badge-post">POST</span></td>
                  <td><code>/register</code></td>
                </tr>
              </tbody>
            </table>
          </div>

          <ul className="roadmap" aria-label="Planned features">
            <li>Project delete</li>
            <li>Tags</li>
            <li>Habits</li>
            <li>Webhooks</li>
            <li>Calendar</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
