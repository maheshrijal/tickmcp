import { type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { Props } from './props';
import { exchangeTickTickCode, getTickTickUserIdentity } from './ticktick-upstream';
import { OAuthStatesRepository, UsersRepository } from '../db/repositories';
import { Env } from '../types/env';

function randomHex(size = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getAuthUrl(env: Env): string {
  return env.TICKTICK_AUTH_URL ?? 'https://ticktick.com/oauth/authorize';
}

function getScope(env: Env): string {
  return env.TICKTICK_OAUTH_SCOPE ?? 'tasks:read tasks:write';
}

function getBaseUrl(request: Request, env: Env): string {
  const requestUrl = new URL(request.url);
  const isLocal =
    requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1' || requestUrl.hostname === '::1';
  if (isLocal) {
    return (env.PUBLIC_BASE_URL ?? requestUrl.origin).replace(/\/$/, '');
  }
  if (!env.PUBLIC_BASE_URL) {
    throw new Error('PUBLIC_BASE_URL must be configured in production');
  }
  return env.PUBLIC_BASE_URL.replace(/\/$/, '');
}

function faviconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#0ea5e9"/>
      <stop offset="100%" stop-color="#22c55e"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="56" height="56" rx="14" fill="#0b1220"/>
  <path d="M20 31.5l8.3 8.8L44 23.7" fill="none" stroke="url(#g)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

function homepageHtml(baseUrl: string): string {
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f3f6fb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a1220" media="(prefers-color-scheme: dark)">
<title>tickmcp — TickTick MCP Server</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=Source+Sans+3:wght@400;600;700&display=swap" as="style">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
:root{
  --bg:#f3f6fb;
  --bg-soft:#ffffff;
  --panel:#ffffffcc;
  --ink:#1e2a39;
  --ink-muted:#4c5a70;
  --line:#d6ddea;
  --accent:#005dcc;
  --accent-2:#007f73;
  --code:#edf2f9;
  --hero-grad-a:#dbe8ff;
  --hero-grad-b:#ddf6f0;
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:#0a1220;
    --bg-soft:#0f1929;
    --panel:#142136d1;
    --ink:#e6eef8;
    --ink-muted:#b9c6d9;
    --line:#22334d;
    --accent:#6ab3ff;
    --accent-2:#4fd1b8;
    --code:#0b1526;
    --hero-grad-a:#142947;
    --hero-grad-b:#14363a;
  }
}
html,body{margin:0;padding:0}
html{color-scheme:light dark}
body{
  background:
    radial-gradient(1200px 480px at 0% -10%,var(--hero-grad-a),transparent 65%),
    radial-gradient(1000px 420px at 95% 10%,var(--hero-grad-b),transparent 60%),
    var(--bg);
  color:var(--ink);
  font-family:"Source Sans 3",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  line-height:1.6;
  padding:2.5rem 1rem 3rem;
  -webkit-tap-highlight-color:transparent;
}
.skip-link{
  position:absolute;
  left:-9999px;
  top:auto;
  width:1px;
  height:1px;
  overflow:hidden;
}
.skip-link:focus{
  left:1rem;
  top:1rem;
  width:auto;
  height:auto;
  z-index:1000;
  padding:.5rem .75rem;
  border-radius:8px;
  border:1px solid var(--line);
  background:var(--bg-soft);
}
.shell{
  max-width:980px;
  margin:0 auto;
  background:var(--panel);
  border:1px solid var(--line);
  border-radius:22px;
  backdrop-filter:blur(8px);
  box-shadow:0 16px 40px #00000020;
  overflow:hidden;
}
.hero{
  padding:2.2rem 2rem 1.4rem;
  border-bottom:1px solid var(--line);
}
h1{
  margin:0 0 .35rem;
  display:flex;
  flex-wrap:wrap;
  gap:.35rem;
  align-items:flex-end;
  font-family:"Fraunces",Georgia,serif;
  font-size:clamp(2rem,4vw,2.9rem);
  line-height:1.1;
  letter-spacing:-.02em;
}
h1 span{
  font-family:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:.95rem;
  color:var(--ink-muted);
  margin-left:.45rem;
}
.lead{margin:0;color:var(--ink-muted);max-width:70ch}
.content{
  padding:1.5rem 2rem 2rem;
  display:grid;
  grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);
  align-items:start;
  gap:1.2rem;
}
@media (max-width:900px){
  .content{grid-template-columns:1fr}
}
.section{
  background:var(--bg-soft);
  border:1px solid var(--line);
  border-radius:14px;
  padding:1rem 1rem .75rem;
  min-height:100%;
  min-width:0;
}
h2{
  margin:.1rem 0 .7rem;
  font-family:"Fraunces",Georgia,serif;
  font-size:1.2rem;
  text-wrap:balance;
}
h3{
  margin:.75rem 0 .4rem;
  font-size:1rem;
}
p{margin:.4rem 0 .6rem;line-height:1.5}
a{
  color:var(--accent);
  touch-action:manipulation;
}
a:hover{color:var(--accent-2)}
a:focus-visible{
  outline:2px solid var(--accent);
  outline-offset:2px;
  border-radius:4px;
}
code{
  font-family:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  background:var(--code);
  border:1px solid var(--line);
  border-radius:6px;
  padding:.15rem .35rem;
  font-size:.86em;
  overflow-wrap:anywhere;
  word-break:break-word;
}
pre{
  margin:.4rem 0 .9rem;
  background:var(--code);
  border:1px solid var(--line);
  border-radius:10px;
  padding:.85rem;
  overflow:auto;
  font-size:.84rem;
  line-height:1.45;
}
pre code{background:none;border:0;padding:0}
ul{margin:.45rem 0 .9rem;padding-left:1rem}
li{margin:.2rem 0}
.label{
  display:inline-block;
  margin-left:.4rem;
  padding:.15rem .5rem;
  font-size:.72rem;
  font-weight:700;
  border-radius:999px;
  color:#fff;
  background:linear-gradient(120deg,var(--accent),var(--accent-2));
}
.quick{
  border-left:3px solid var(--accent-2);
  padding-left:.8rem;
  color:var(--ink-muted);
}
.mono-list code{white-space:nowrap}
.mono-list li{overflow-wrap:anywhere}
.mono-list li code{
  white-space:normal;
  display:inline;
}
@media (max-width:680px){
  .hero{padding:1.6rem 1.2rem 1rem}
  .content{padding:1rem 1.2rem 1.2rem}
  footer{padding:.9rem 1.2rem 1.1rem}
  .mono-list code{white-space:normal;overflow-wrap:anywhere}
}
footer{
  border-top:1px solid var(--line);
  padding:1rem 2rem 1.3rem;
  color:var(--ink-muted);
  font-size:.92rem;
}
</style>
</head>
<body>
<a href="#main-content" class="skip-link">Skip to Main Content</a>
<div class="shell">
<section class="hero">
  <h1>tickmcp <span>TickTick MCP Server</span></h1>
  <p class="lead">Remote multi-user TickTick MCP server on Cloudflare Workers. OAuth is handled by your MCP client; add one endpoint and connect.</p>
</section>
<main id="main-content" class="content">
  <section class="section">
    <h2>Quick Onboarding</h2>
    <p>MCP endpoint: <code>${e(baseUrl)}/mcp</code> <span class="label">POST</span></p>
    <p class="quick">Same fast setup: add the server URL in your client and complete OAuth when prompted.</p>
    <h3>Codex</h3>
    <pre><code>codex mcp add tickmcp --url ${e(baseUrl)}/mcp</code></pre>
    <h3>Claude Code</h3>
    <pre><code>claude mcp add tickmcp --transport http ${e(baseUrl)}/mcp</code></pre>
    <h3>Claude Desktop / Cursor</h3>
    <pre><code>{
  "mcpServers": {
    "tickmcp": {
      "type": "streamableHttp",
      "url": "${e(baseUrl)}/mcp"
    }
  }
}</code></pre>
    <h3>ChatGPT</h3>
    <p>Add as a remote MCP server with URL: <code>${e(baseUrl)}/mcp</code></p>
  </section>
  <section class="section mono-list">
    <h2>Supported Today</h2>
    <p>Only currently implemented tools and endpoints are listed here.</p>
    <h3>Auth</h3>
    <ul>
      <li><code>ticktick_auth_status()</code></li>
    </ul>
    <h3>Projects</h3>
    <ul>
      <li><code>ticktick_list_projects()</code></li>
      <li><code>ticktick_get_project({ projectId })</code></li>
    </ul>
    <h3>Tasks</h3>
    <ul>
      <li><code>ticktick_list_tasks({ projectId?, status?, dueFilter? })</code></li>
      <li><code>ticktick_get_task({ projectId, taskId })</code></li>
      <li><code>ticktick_create_task({ idempotencyKey, projectId, title, ... })</code></li>
      <li><code>ticktick_update_task({ idempotencyKey, projectId, taskId, ... })</code></li>
      <li><code>ticktick_complete_task({ idempotencyKey, projectId, taskId })</code></li>
      <li><code>ticktick_delete_task({ idempotencyKey, projectId, taskId })</code></li>
    </ul>
    <h3>Not Supported Yet</h3>
    <ul>
      <li>Project create/update/delete tools</li>
      <li>Tags, focus, habits, and calendar-specific endpoints</li>
      <li>Webhook/event subscriptions</li>
    </ul>
    <h3>HTTP Endpoints</h3>
    <ul>
      <li><code>POST /mcp</code></li>
      <li><code>GET /authorize</code></li>
      <li><code>GET /callback</code></li>
      <li><code>POST /token</code> (provider-managed)</li>
      <li><code>POST /register</code> (provider-managed)</li>
    </ul>
  </section>
</main>
<footer>
  <a href="https://github.com/maheshrijal/tickmcp">github.com/maheshrijal/tickmcp</a>
</footer>
</div>
</body>
</html>`;
}

function securityHeaders(contentType: string): Record<string, string> {
  return {
    'content-type': contentType,
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  };
}

export const tickTickAuthHandler: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const baseUrl = getBaseUrl(request, env);

    if (request.method === 'GET' && url.pathname === '/authorize') {
      return handleAuthorize(request, env, baseUrl);
    }

    if (request.method === 'GET' && url.pathname === '/callback') {
      return handleCallback(request, env, baseUrl);
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(homepageHtml(baseUrl), {
        status: 200,
        headers: securityHeaders('text/html; charset=utf-8'),
      });
    }

    if (request.method === 'GET' && url.pathname === '/favicon.svg') {
      return new Response(faviconSvg(), {
        status: 200,
        headers: {
          'content-type': 'image/svg+xml; charset=utf-8',
          'cache-control': 'public, max-age=86400',
        },
      });
    }

    if (request.method === 'GET' && url.pathname === '/favicon.ico') {
      return Response.redirect(`${baseUrl}/favicon.svg`, 302);
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function handleAuthorize(request: Request, env: Env, baseUrl: string): Promise<Response> {
  let mcpOAuthRequest: AuthRequest;
  try {
    mcpOAuthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch {
    return new Response('Invalid OAuth authorization request', { status: 400 });
  }

  const clientInfo = await env.OAUTH_PROVIDER.lookupClient(mcpOAuthRequest.clientId);
  if (!clientInfo) {
    return new Response('Unknown OAuth client', { status: 400 });
  }

  if (!clientInfo.redirectUris.includes(mcpOAuthRequest.redirectUri)) {
    return new Response('OAuth redirect_uri is not registered for this client', { status: 400 });
  }

  const tickTickState = randomHex(24);
  const codeVerifier = randomHex(48);
  const tickTickCodeChallenge = await sha256Base64Url(codeVerifier);
  const oauthStatesRepo = new OAuthStatesRepository(env.DB);

  await oauthStatesRepo.create({
    state: tickTickState,
    mcpOAuthRequest,
    codeVerifier,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  const params = new URLSearchParams({
    client_id: env.TICKTICK_CLIENT_ID,
    redirect_uri: `${baseUrl}/callback`,
    response_type: 'code',
    scope: getScope(env),
    state: tickTickState,
    code_challenge: tickTickCodeChallenge,
    code_challenge_method: 'S256',
  });

  return Response.redirect(`${getAuthUrl(env)}?${params.toString()}`, 302);
}

async function handleCallback(request: Request, env: Env, baseUrl: string): Promise<Response> {
  const url = new URL(request.url);

  const error = url.searchParams.get('error');
  if (error) {
    return new Response(`TickTick authorization failed: ${error}`, { status: 400 });
  }

  const tickTickState = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!tickTickState || !code) {
    return new Response('Missing authorization callback parameters', { status: 400 });
  }

  const oauthStatesRepo = new OAuthStatesRepository(env.DB);
  const stored = await oauthStatesRepo.consume(tickTickState, new Date().toISOString());
  if (!stored) {
    return new Response('Invalid or expired OAuth state', { status: 400 });
  }

  // Exchange code for TickTick tokens
  const redirectUri = `${baseUrl}/callback`;
  const tokenResponse = await exchangeTickTickCode(code, stored.codeVerifier, redirectUri, env);

  if (!tokenResponse.access_token) {
    return new Response('TickTick token response is missing access token', { status: 502 });
  }

  // Get TickTick user identity
  const userInfo = await getTickTickUserIdentity(tokenResponse.access_token, env);

  // Ensure user exists in D1
  const usersRepo = new UsersRepository(env.DB);
  const user = await usersRepo.ensureBySubject(userInfo.username);

  // Compute expires_at
  const expiresAt = tokenResponse.expires_in
    ? new Date(Date.now() + Math.max(0, tokenResponse.expires_in - 30) * 1000).toISOString()
    : null;

  const props: Props = {
    userId: user.id,
  };

  await env.OAUTH_KV.put(
    `ticktick_tokens:${user.id}`,
    JSON.stringify({
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? null,
      expiresAt: expiresAt,
      scope: tokenResponse.scope ?? getScope(env),
      updatedAt: new Date().toISOString(),
    }),
    { expirationTtl: 60 * 60 * 24 * 30 },
  );

  // Complete the MCP OAuth authorization — this generates an authorization code
  // and redirects the user back to the MCP client
  const oauthHelpers: OAuthHelpers = env.OAUTH_PROVIDER;
  const { redirectTo } = await oauthHelpers.completeAuthorization({
    request: stored.mcpOAuthRequest,
    userId: user.id,
    metadata: { label: `TickTick (${userInfo.username})` },
    scope: stored.mcpOAuthRequest.scope ?? [],
    props,
  });

  return Response.redirect(redirectTo, 302);
}
