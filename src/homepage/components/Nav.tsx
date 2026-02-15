export function Nav() {
  return (
    <nav aria-label="Main">
      <a href="/" className="nav-brand" aria-label="tickmcp home">
        <span className="nav-mark" aria-hidden="true">
          <svg viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <path d="M2.5 7.5l3 3 6-7" />
          </svg>
        </span>
        tickmcp
      </a>
      <div className="nav-links">
        <a href="#get-started">Setup</a>
        <a href="#api-surface">API</a>
        <a href="#trust">Trust</a>
        <a href="https://github.com/maheshrijal/tickmcp">GitHub</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      </div>
    </nav>
  );
}
