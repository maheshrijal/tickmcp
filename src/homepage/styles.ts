/**
 * TickMCP homepage CSS.
 * Full-width editorial layout. Zinc monochrome, violet accent.
 */
export const homepageStyles = `
*{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:#09090b;
  --surface:#18181b;
  --surface-2:#27272a;
  --surface-3:#3f3f46;
  --ink:#fafafa;
  --ink-2:#a1a1aa;
  --ink-3:#71717a;
  --ink-4:#52525b;
  --border:#27272a;
  --border-2:#3f3f46;
  --accent:#a78bfa;
  --accent-dim:#7c3aed;
  --accent-glow:rgba(167,139,250,.1);
  --green:#4ade80;
  --green-dim:rgba(74,222,128,.12);
  --blue:#60a5fa;
  --blue-dim:rgba(96,165,250,.12);
  --orange:#fb923c;
  --orange-dim:rgba(251,146,60,.12);
  --code-bg:#0f0f12;
  --radius:10px;
  --mono:"Berkeley Mono","IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
}

@media(prefers-color-scheme:light){
  :root{
    --bg:#ffffff;
    --surface:#f4f4f5;
    --surface-2:#e4e4e7;
    --surface-3:#d4d4d8;
    --ink:#09090b;
    --ink-2:#52525b;
    --ink-3:#71717a;
    --ink-4:#a1a1aa;
    --border:#e4e4e7;
    --border-2:#d4d4d8;
    --accent:#7c3aed;
    --accent-dim:#a78bfa;
    --accent-glow:rgba(124,58,237,.06);
    --green:#16a34a;
    --green-dim:rgba(22,163,74,.08);
    --blue:#2563eb;
    --blue-dim:rgba(37,99,235,.08);
    --orange:#ea580c;
    --orange-dim:rgba(234,88,12,.08);
    --code-bg:#f8f8fa;
  }
}

html{color-scheme:dark light;scroll-behavior:smooth}

body{
  background:var(--bg);
  color:var(--ink);
  font-family:var(--sans);
  font-size:15px;
  line-height:1.6;
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
  -webkit-tap-highlight-color:transparent;
  overflow-x:hidden;
}

/* === SKIP LINK === */
.skip{
  position:absolute;left:-9999px;top:auto;
  width:1px;height:1px;overflow:hidden;
}
.skip:focus{
  left:1rem;top:1rem;width:auto;height:auto;z-index:1000;
  padding:.4rem .75rem;border-radius:6px;
  background:var(--surface);border:1px solid var(--border-2);
  color:var(--accent);font-size:.8rem;outline:none;
}

/* === NAV === */
nav{
  position:sticky;top:0;z-index:50;
  display:flex;align-items:center;justify-content:space-between;
  padding:.75rem 2rem;
  background:color-mix(in srgb,var(--bg) 85%,transparent);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border-bottom:1px solid var(--border);
}
.nav-brand{
  display:flex;align-items:center;gap:.5rem;
  font-family:var(--mono);font-size:.85rem;font-weight:600;
  color:var(--ink);text-decoration:none;letter-spacing:-.01em;
}
.nav-mark{
  width:24px;height:24px;border-radius:6px;
  background:linear-gradient(135deg,var(--accent),var(--blue));
  display:grid;place-items:center;flex-shrink:0;
}
.nav-mark svg{width:14px;height:14px}
.nav-links{display:flex;align-items:center;gap:1.25rem}
.nav-links a{
  font-size:.8rem;color:var(--ink-3);text-decoration:none;
  transition:color .15s;
}
.nav-links a:hover{color:var(--ink)}
.nav-links a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}

/* === HERO === */
.hero{
  padding:5rem 2rem 4rem;
  max-width:720px;
  margin:0 auto;
  text-align:center;
}
.hero-eyebrow{
  display:inline-flex;align-items:center;gap:.4rem;
  padding:.3rem .8rem;border-radius:999px;
  border:1px solid var(--border);background:var(--surface);
  font-size:.7rem;font-weight:600;color:var(--ink-2);
  letter-spacing:.04em;text-transform:uppercase;
  margin-bottom:1.5rem;
}
.hero-dot{
  width:5px;height:5px;border-radius:50%;
  background:var(--green);
  box-shadow:0 0 8px var(--green);
  animation:blink 2.5s ease-in-out infinite;
}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}

h1{
  font-family:var(--sans);
  font-size:clamp(2.5rem,6vw,4rem);
  font-weight:750;
  line-height:1;
  letter-spacing:-.04em;
  margin-bottom:1rem;
  color:var(--ink);
}
h1 em{
  font-style:normal;
  background:linear-gradient(135deg,var(--accent),var(--blue));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
}

.hero-sub{
  font-size:1.1rem;line-height:1.6;
  color:var(--ink-2);
  max-width:48ch;margin:0 auto 2rem;
  text-wrap:pretty;
}

/* === ENDPOINT === */
.endpoint{
  display:inline-flex;align-items:center;gap:.5rem;
  padding:.6rem 1rem;border-radius:var(--radius);
  background:var(--surface);border:1px solid var(--border);
  font-family:var(--mono);font-size:.85rem;
  color:var(--ink);
  transition:border-color .2s;
  max-width:100%;
}
.endpoint:hover{border-color:var(--border-2)}
.endpoint code{
  overflow-wrap:anywhere;word-break:break-all;
}
.endpoint-badge{
  padding:.15rem .45rem;border-radius:4px;
  font-size:.6rem;font-weight:700;letter-spacing:.04em;
  background:var(--accent-glow);color:var(--accent);
  flex-shrink:0;
}

/* === SECTION LAYOUT === */
.page-section{
  max-width:960px;
  margin:0 auto;
  padding:3.5rem 2rem;
}
.page-section + .page-section{
  border-top:1px solid var(--border);
}

.section-label{
  font-size:.7rem;font-weight:700;
  text-transform:uppercase;letter-spacing:.08em;
  color:var(--ink-3);
  margin-bottom:1.25rem;
}

/* === CLIENT SETUP LIST === */
.setup-list{
  display:flex;flex-direction:column;
  gap:.75rem;
}

.setup-item{
  padding:1rem 1.25rem;
  border-radius:var(--radius);
  border:1px solid var(--border);
  background:var(--surface);
  transition:border-color .2s;
}
.setup-item:hover{border-color:var(--border-2)}

.setup-header{
  display:flex;align-items:center;gap:.5rem;
  margin-bottom:.5rem;
}
.setup-name{
  font-size:.75rem;font-weight:700;
  text-transform:uppercase;letter-spacing:.06em;
  color:var(--ink-3);
}
.setup-desc{
  font-size:.8rem;color:var(--ink-3);
  margin-bottom:.4rem;
}

pre{
  margin:0;padding:.6rem .75rem;
  background:var(--code-bg);
  border:1px solid var(--border);
  border-radius:8px;
  font-size:.78rem;line-height:1.55;
  white-space:pre-wrap;
  word-break:break-all;
  overflow-wrap:anywhere;
}
code{font-family:var(--mono);font-size:.82em}
pre code{background:none;border:0;padding:0;font-size:inherit}
p code,li code{
  background:var(--surface);border:1px solid var(--border);
  border-radius:4px;padding:.1rem .3rem;
  overflow-wrap:anywhere;word-break:break-word;
}

/* === TOOLS SECTION === */
.tools-columns{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:1.5rem 2rem;
}
@media(max-width:768px){
  .tools-columns{grid-template-columns:1fr}
}

.tool-group h3{
  font-size:.7rem;font-weight:700;
  text-transform:uppercase;letter-spacing:.08em;
  color:var(--ink-3);
  margin-bottom:.6rem;
  padding-bottom:.4rem;
  border-bottom:1px solid var(--border);
}
.tool-group--spaced{
  margin-top:1.25rem;
}

.tool-list{list-style:none;padding:0}
.tool-list li{
  padding:.25rem 0;
  font-size:.8rem;
  display:flex;align-items:center;gap:.35rem;
  color:var(--ink-2);
}
.tool-list li code{
  font-size:.78rem;
  background:none;border:none;padding:0;
  color:var(--ink);
}

.tool-dot{
  width:5px;height:5px;border-radius:50%;
  flex-shrink:0;
}
.dot-green{background:var(--green)}
.dot-blue{background:var(--blue)}
.dot-orange{background:var(--orange)}

/* === ENDPOINTS TABLE === */
.endpoint-table{
  width:100%;
  border-collapse:collapse;
  font-size:.8rem;
}
.endpoint-table th{
  text-align:left;
  font-size:.65rem;font-weight:700;
  text-transform:uppercase;letter-spacing:.06em;
  color:var(--ink-4);
  padding:.4rem 0;
  border-bottom:1px solid var(--border);
}
.endpoint-table td{
  padding:.45rem 0;
  border-bottom:1px solid var(--border);
  color:var(--ink-2);
}
.endpoint-table tr:last-child td{border-bottom:none}
.endpoint-table code{font-size:.78rem;color:var(--ink)}

.method-badge{
  display:inline-block;padding:.1rem .4rem;border-radius:4px;
  font-family:var(--mono);font-size:.65rem;font-weight:700;
  letter-spacing:.03em;
}
.badge-post{background:var(--blue-dim);color:var(--blue)}
.badge-get{background:var(--green-dim);color:var(--green)}

/* === ROADMAP === */
.roadmap{
  list-style:none;padding:0;
  margin-top:1rem;
  display:flex;flex-wrap:wrap;gap:.4rem;
}
.roadmap li{
  padding:.3rem .65rem;border-radius:999px;
  font-size:.72rem;
  border:1px dashed var(--border-2);
  color:var(--ink-3);
}

/* === FOOTER === */
footer{
  border-top:1px solid var(--border);
  padding:1.25rem 2rem;
  display:flex;align-items:center;justify-content:space-between;
  max-width:960px;
  margin:0 auto;
  font-size:.78rem;color:var(--ink-4);
}
footer a{
  color:var(--ink-3);text-decoration:none;
  display:inline-flex;align-items:center;gap:.35rem;
  transition:color .15s;
}
footer a:hover{color:var(--ink)}
footer a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}
footer svg{width:14px;height:14px}

/* === LINKS === */
a{color:var(--accent);text-decoration:none;transition:color .15s;touch-action:manipulation}
a:hover{color:var(--ink)}
a:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:3px}

/* === ANIMATIONS === */
@keyframes fadeUp{
  from{opacity:0;transform:translateY(8px)}
  to{opacity:1;transform:translateY(0)}
}
.hero{animation:fadeUp .6s ease both}
.page-section{animation:fadeUp .6s ease both;animation-delay:.1s}
.page-section:nth-child(3){animation-delay:.15s}
.page-section:nth-child(4){animation-delay:.2s}

@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{
    animation-duration:.01ms!important;
    animation-iteration-count:1!important;
    transition-duration:.01ms!important;
  }
}

/* === RESPONSIVE === */
@media(max-width:640px){
  nav{padding:.6rem 1rem}
  .hero{padding:3rem 1.25rem 2.5rem}
  .page-section{padding:2.5rem 1.25rem}
  footer{padding:1rem 1.25rem;flex-direction:column;gap:.5rem}
  .nav-links{gap:.75rem}
}
`;
