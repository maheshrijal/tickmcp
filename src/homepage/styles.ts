/**
 * TickMCP homepage CSS.
 * Nightpress — warm editorial dark with golden-sunrise h1 gradient.
 * Dark mode: bright lemon-gold → vivid orange (sunrise).
 * Light mode: deep rust → deep ocean (clearly distinct on parchment).
 */
export const homepageStyles = `
*{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:#0d0c08;
  --surface:#181610;
  --surface-2:#211f14;
  --surface-3:#2e2b1c;
  --ink:#f0ead8;
  --ink-2:#c8bfa8;
  --ink-3:#86806e;
  --ink-4:#5e5a4e;
  --border:#252210;
  --border-2:#403c28;
  --accent:#f5c032;
  --accent-dim:#d4a020;
  --accent-glow:rgba(245,192,50,.15);
  --h1-start:#fde68a;
  --h1-end:#fb923c;
  --green:#4ade80;
  --green-dim:rgba(74,222,128,.13);
  --blue:#7dd3fc;
  --blue-dim:rgba(125,211,252,.13);
  --orange:#f87171;
  --orange-dim:rgba(248,113,113,.13);
  --code-bg:#080805;
  --radius:8px;
  --mono:"IBM Plex Mono","SF Mono",Menlo,Consolas,monospace;
  --sans:"Avenir Next","Segoe UI",Helvetica,sans-serif;
  --display:"Iowan Old Style","Palatino Linotype","Book Antiqua",Palatino,serif;
}

@media(prefers-color-scheme:light){
  :root{
    --bg:#f9f5ec;
    --surface:#eeeadf;
    --surface-2:#e4dece;
    --surface-3:#d6cebc;
    --ink:#1a1710;
    --ink-2:#3b3620;
    --ink-3:#625c46;
    --ink-4:#888060;
    --border:#ddd7c6;
    --border-2:#bfb89a;
    --accent:#9c4a00;
    --accent-dim:#b85800;
    --accent-glow:rgba(156,74,0,.1);
    --h1-start:#92400e;
    --h1-end:#0c4a6e;
    --green:#15803d;
    --green-dim:rgba(21,128,61,.1);
    --blue:#1d4ed8;
    --blue-dim:rgba(29,78,216,.1);
    --orange:#b91c1c;
    --orange-dim:rgba(185,28,28,.1);
    --code-bg:#ede8da;
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
  background-image:
    radial-gradient(ellipse 70% 50% at -5% 0%,color-mix(in srgb,var(--h1-start) 12%,transparent),transparent 55%),
    radial-gradient(ellipse 50% 40% at 105% 5%,color-mix(in srgb,var(--h1-end) 10%,transparent),transparent 50%);
}

/* Grain overlay */
body::after{
  content:'';
  position:fixed;
  inset:0;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
  opacity:.03;
  pointer-events:none;
  z-index:9999;
}

/* Skip link */
.skip{
  position:absolute;left:-9999px;top:auto;
  width:1px;height:1px;overflow:hidden;
}
.skip:focus{
  left:1rem;top:1rem;width:auto;height:auto;z-index:1000;
  padding:.4rem .75rem;border-radius:6px;
  background:var(--surface);border:1px solid var(--border-2);
  color:var(--accent);font-size:.8rem;
}

/* NAV */
nav{
  position:sticky;top:0;z-index:50;
  display:flex;align-items:center;justify-content:space-between;
  padding:.7rem 2rem;
  background:color-mix(in srgb,var(--bg) 82%,transparent);
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  border-bottom:1px solid var(--border);
  box-shadow:0 1px 0 0 color-mix(in srgb,var(--accent) 8%,transparent);
}
.nav-brand{
  display:flex;align-items:center;gap:.5rem;
  font-family:var(--mono);font-size:.85rem;font-weight:600;
  color:var(--ink);text-decoration:none;letter-spacing:-.01em;
}
.nav-mark{
  width:22px;height:22px;border-radius:5px;
  background:linear-gradient(135deg,var(--h1-start),var(--h1-end));
  display:grid;place-items:center;flex-shrink:0;
  box-shadow:0 0 12px var(--accent-glow);
}
.nav-mark svg{width:13px;height:13px}
.nav-links{display:flex;align-items:center;gap:1.25rem}
.nav-links a{
  font-size:.78rem;color:var(--ink-3);text-decoration:none;
  transition:color .15s;letter-spacing:.01em;
}
.nav-links a:hover{color:var(--ink)}
.nav-links a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}

/* HERO — split layout */
.hero{
  padding:5.5rem 2rem 4rem;
  max-width:1060px;
  margin:0 auto;
  display:flex;
  align-items:center;
  gap:3.5rem;
}
.hero-content{
  flex:1;
  min-width:0;
}
.hero-eyebrow{
  display:inline-flex;align-items:center;gap:.4rem;
  padding:.3rem .75rem;border-radius:999px;
  border:1px solid var(--border);background:var(--surface);
  font-size:.67rem;font-weight:700;color:var(--ink-2);
  letter-spacing:.06em;text-transform:uppercase;
  margin-bottom:1.75rem;
}
.hero-dot{
  width:5px;height:5px;border-radius:50%;
  background:var(--green);
  box-shadow:0 0 8px var(--green);
  animation:blink 2.5s ease-in-out infinite;
}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}

h1{
  font-family:var(--display);
  font-size:clamp(2.75rem,6.5vw,4.75rem);
  font-weight:700;
  line-height:.97;
  letter-spacing:-.025em;
  margin-bottom:1.25rem;
  color:var(--ink);
  text-wrap:balance;
}

/* Sunrise gradient — h1-start and h1-end differ significantly in both modes */
h1 em,h1 a{
  font-style:normal;
  background:linear-gradient(130deg,var(--h1-start) 0%,var(--h1-end) 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;color:transparent;
}

/* Underline marks the link as interactive, distinct from the em */
h1 a{
  text-decoration:underline;
  text-decoration-color:color-mix(in srgb,var(--h1-start) 40%,transparent);
  text-decoration-thickness:2px;
  text-underline-offset:5px;
}
h1 a:hover{text-decoration-color:var(--h1-start)}
h1 a:hover,h1 a:visited{color:transparent;-webkit-text-fill-color:transparent}
h1 a:focus-visible{outline:2px solid var(--accent);outline-offset:4px;border-radius:4px}

.hero-sub{
  font-size:1.05rem;line-height:1.65;
  color:var(--ink-2);
  max-width:52ch;
  text-wrap:pretty;
}
.hero-sub+.hero-sub{
  margin-top:.85rem;
  margin-bottom:2rem;
}

.endpoint{
  display:inline-flex;align-items:center;gap:.5rem;
  padding:.55rem .9rem;border-radius:var(--radius);
  background:var(--surface);border:1px solid var(--border);
  font-family:var(--mono);font-size:.82rem;
  color:var(--ink);
  transition:border-color .2s,box-shadow .2s;
  max-width:100%;
}
.endpoint:hover{border-color:var(--border-2);box-shadow:0 0 0 3px var(--accent-glow)}
.endpoint code{overflow-wrap:anywhere;word-break:break-all}
.endpoint-badge{
  padding:.15rem .4rem;border-radius:4px;
  font-size:.58rem;font-weight:700;letter-spacing:.06em;
  background:var(--accent-glow);color:var(--accent);
  flex-shrink:0;
}
.hero-meta{
  margin-top:1.1rem;
  font-size:.74rem;
  color:var(--ink-3);
  letter-spacing:.02em;
}

/* TERMINAL PREVIEW */
.hero-terminal-wrap{
  flex:0 0 360px;
  width:360px;
}
.terminal{
  background:var(--code-bg);
  border:1px solid var(--border);
  border-radius:10px;
  overflow:hidden;
  font-family:var(--mono);
  font-size:.72rem;
  line-height:1.5;
  box-shadow:0 8px 40px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.04);
}
.terminal-bar{
  background:var(--surface);
  border-bottom:1px solid var(--border);
  padding:.55rem .85rem;
  display:flex;
  align-items:center;
  gap:.4rem;
}
.terminal-btn{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.terminal-btn-r{background:#e05e5e}
.terminal-btn-y{background:#e0b450}
.terminal-btn-g{background:#4ec864}
.terminal-label{
  margin-left:.5rem;
  font-size:.62rem;
  color:var(--ink-3);
  letter-spacing:.05em;
  flex:1;
}
.terminal-body{padding:1rem 1.2rem 1.2rem}
.terminal-line{
  color:var(--ink-3);
  margin-bottom:.1rem;
}
.terminal-prompt{color:var(--accent);margin-right:.35rem;font-weight:700}
.terminal-cmd{color:var(--ink)}
.terminal-dim{color:var(--ink-4)}
.terminal-success{color:var(--green);margin-right:.4rem}
.terminal-blank{display:block;height:.55rem}
.terminal-task{
  display:flex;
  align-items:baseline;
  gap:.5rem;
  margin-bottom:.22rem;
  color:var(--ink-2);
}
.terminal-task-dot-active{color:var(--accent)}
.terminal-task-dot-open{color:var(--ink-4)}
.terminal-task-title{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.terminal-priority-high{color:var(--h1-end);font-size:.65rem;flex-shrink:0;letter-spacing:.04em}
.terminal-priority-med{color:var(--ink-3);font-size:.65rem;flex-shrink:0;letter-spacing:.04em}
.terminal-divider{border:none;border-top:1px solid var(--border);margin:.65rem 0}
.terminal-count{color:var(--ink-4);font-size:.67rem}
.terminal-cursor{
  display:inline-block;
  width:5px;height:.82em;
  background:var(--accent);
  vertical-align:text-bottom;
  margin-left:2px;
  animation:blink-cur 1.1s step-end infinite;
}
@keyframes blink-cur{0%,100%{opacity:1}50%{opacity:0}}

/* PAGE SECTIONS */
.page-section{
  max-width:960px;
  margin:0 auto;
  padding:3.5rem 2rem;
  scroll-margin-top:4.5rem;
}
.page-section+.page-section{border-top:1px solid var(--border)}

/* Editorial section label with extending rule */
.section-label{
  display:flex;
  align-items:center;
  gap:.85rem;
  font-size:.67rem;font-weight:700;
  text-transform:uppercase;letter-spacing:.1em;
  color:var(--ink-3);
  margin-bottom:1.5rem;
}
.section-label::after{
  content:'';
  flex:1;
  height:1px;
  background:linear-gradient(to right,var(--border),transparent);
}

/* SETUP ITEMS */
.setup-list{display:flex;flex-direction:column;gap:.75rem}
.setup-item{
  padding:1rem 1.25rem;
  border-radius:var(--radius);
  border:1px solid var(--border);
  background:var(--surface);
  transition:border-color .2s,background .2s;
  position:relative;
  overflow:hidden;
}
.setup-item::before{
  content:'';
  position:absolute;
  left:0;top:0;bottom:0;
  width:2px;
  background:linear-gradient(to bottom,var(--h1-start),var(--h1-end));
  opacity:0;
  transition:opacity .2s;
}
.setup-item:hover{border-color:var(--border-2);background:var(--surface-2)}
.setup-item:hover::before{opacity:1}

.setup-header{
  display:flex;align-items:center;gap:.5rem;
  margin-bottom:.5rem;
}
.setup-step{
  font-family:var(--mono);
  font-size:.6rem;
  font-weight:700;
  color:var(--accent);
  letter-spacing:.08em;
  opacity:.8;
}
.setup-name{
  font-size:.72rem;font-weight:700;
  text-transform:uppercase;letter-spacing:.07em;
  color:var(--ink-3);
}
.setup-desc{font-size:.8rem;color:var(--ink-3);margin-bottom:.4rem}

/* CODE */
pre{
  margin:0;padding:.65rem .8rem;
  background:var(--code-bg);
  border:1px solid var(--border);
  border-radius:7px;
  font-size:.76rem;line-height:1.55;
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

/* TOOLS */
.tools-columns{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:1.5rem 2rem;
}
.tool-group h3{
  font-size:.65rem;font-weight:700;
  text-transform:uppercase;letter-spacing:.09em;
  color:var(--ink-3);
  margin-bottom:.65rem;
  padding-bottom:.4rem;
  border-bottom:1px solid var(--border);
}
.tool-group--spaced{margin-top:1.25rem}
.tool-list{list-style:none;padding:0}
.tool-list li{
  padding:.22rem 0;
  font-size:.78rem;
  display:flex;align-items:flex-start;gap:.35rem;
  color:var(--ink-2);
}
.tool-list li code{
  font-size:.76rem;
  background:none;border:none;padding:0;
  color:var(--ink);
}
.tool-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;margin-top:.42em}
.dot-green{background:var(--green)}
.dot-blue{background:var(--blue)}
.dot-orange{background:var(--orange)}

/* ENDPOINT TABLE */
.endpoint-table{width:100%;border-collapse:collapse;font-size:.78rem}
.endpoint-table th{
  text-align:left;
  font-size:.63rem;font-weight:700;
  text-transform:uppercase;letter-spacing:.07em;
  color:var(--ink-4);
  padding:.4rem 0;
  border-bottom:1px solid var(--border);
}
.endpoint-table td{
  padding:.42rem 0;
  border-bottom:1px solid var(--border);
  color:var(--ink-2);
}
.endpoint-table tr:last-child td{border-bottom:none}
.endpoint-table code{font-size:.76rem;color:var(--ink)}
.method-badge{
  display:inline-block;padding:.1rem .38rem;border-radius:4px;
  font-family:var(--mono);font-size:.62rem;font-weight:700;
  letter-spacing:.03em;
}
.badge-post{background:var(--blue-dim);color:var(--blue)}
.badge-get{background:var(--green-dim);color:var(--green)}

/* ROADMAP */
.roadmap{
  list-style:none;padding:0;
  margin-top:1rem;
  display:flex;flex-wrap:wrap;gap:.4rem;
}
.roadmap li{
  padding:.28rem .6rem;border-radius:999px;
  font-size:.7rem;
  border:1px dashed var(--border-2);
  color:var(--ink-3);
  transition:border-color .2s,color .2s;
}
.roadmap li:hover{border-color:var(--accent);color:var(--ink-2)}

/* FOOTER */
footer{
  border-top:1px solid var(--border);
  padding:1.5rem 2rem;
  display:flex;align-items:center;justify-content:space-between;
  max-width:960px;
  margin:0 auto;
  font-size:.76rem;color:var(--ink-4);
}
footer a{
  color:var(--ink-3);text-decoration:none;
  display:inline-flex;align-items:center;gap:.35rem;
  transition:color .15s;
}
.footer-links{display:flex;align-items:center;gap:.85rem;flex-wrap:wrap}
footer a:hover{color:var(--ink)}
footer a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}
footer svg{width:14px;height:14px}

/* GLOBAL LINKS */
a{color:var(--accent);text-decoration:none;transition:color .15s;touch-action:manipulation}
a:hover{color:var(--ink)}
a:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:3px}

/* ANIMATIONS */
@keyframes fadeUp{
  from{opacity:0;transform:translateY(10px)}
  to{opacity:1;transform:translateY(0)}
}
.hero-content{animation:fadeUp .7s cubic-bezier(.16,1,.3,1) both}
.hero-terminal-wrap{animation:fadeUp .7s cubic-bezier(.16,1,.3,1) both;animation-delay:.15s}
.page-section{animation:fadeUp .6s ease both;animation-delay:.1s}
.page-section:nth-child(3){animation-delay:.15s}
.page-section:nth-child(4){animation-delay:.2s}
.page-section:nth-child(5){animation-delay:.25s}

@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{
    animation-duration:.01ms!important;
    animation-iteration-count:1!important;
    transition-duration:.01ms!important;
  }
}

/* RESPONSIVE */
@media(max-width:900px){
  .hero{gap:2rem}
  .hero-terminal-wrap{flex:0 0 300px;width:300px}
  .terminal{font-size:.68rem}
}
@media(max-width:768px){
  .hero{flex-direction:column;text-align:center}
  .hero-content{text-align:center}
  .hero-sub{max-width:none}
  .hero-terminal-wrap{width:100%;max-width:440px;flex:none}
  .tools-columns{grid-template-columns:1fr}
}
@media(max-width:640px){
  nav{padding:.6rem 1rem}
  .hero{padding:3rem 1.25rem 2.5rem}
  .page-section{padding:2.5rem 1.25rem}
  footer{padding:1rem 1.25rem;flex-direction:column;gap:.5rem;text-align:center}
  .nav-links{gap:.75rem}
  .hero-terminal-wrap{display:none}
}
`;
