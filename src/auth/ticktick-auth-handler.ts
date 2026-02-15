import { type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { Props } from './props';
import { exchangeTickTickCode } from './ticktick-upstream';
import { OAuthStatesRepository, UsersRepository } from '../db/repositories';
import { Env } from '../types/env';
import { HOMEPAGE_HTML_TEMPLATE } from '../homepage/homepage-html';

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

async function deriveSubjectFromToken(accessToken: string): Promise<string> {
  const hash = await sha256Base64Url(`ticktick:${accessToken}`);
  return `tt_${hash.slice(0, 32)}`;
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

function socialCardSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#111214"/>
      <stop offset="100%" stop-color="#1f2a36"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#f0b44d"/>
      <stop offset="100%" stop-color="#ff9f53"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="980" cy="120" r="180" fill="#2a3948" opacity=".35"/>
  <circle cx="1060" cy="500" r="220" fill="#1f88b5" opacity=".18"/>
  <rect x="72" y="84" width="1056" height="462" rx="28" fill="#14171c" stroke="#475362"/>
  <text x="132" y="240" fill="#f7f3e8" font-size="78" font-family="'Avenir Next','Segoe UI',sans-serif" font-weight="700">tickmcp</text>
  <text x="132" y="305" fill="#d5ccbb" font-size="36" font-family="'Avenir Next','Segoe UI',sans-serif">Remote TickTick MCP server</text>
  <rect x="132" y="350" width="374" height="58" rx="10" fill="#1a1d21" stroke="#475362"/>
  <text x="156" y="388" fill="#f0b44d" font-size="28" font-family="'IBM Plex Mono',Menlo,monospace">https://tickmcp.mrjl.dev/mcp</text>
  <text x="132" y="465" fill="#6ecdf4" font-size="26" font-family="'IBM Plex Mono',Menlo,monospace">OAuth + Cloudflare Workers + MCP</text>
  <rect x="954" y="438" width="86" height="86" rx="16" fill="url(#accent)"/>
  <path d="M978 484l22 23 40-47" fill="none" stroke="#111214" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

function legalPageHtml(baseUrl: string, page: 'about' | 'contact' | 'privacy'): string {
  const content =
    page === 'about'
      ? {
          title: 'About tickmcp and Project Scope',
          description: 'About tickmcp, the open source TickTick MCP server, including project goals and operating scope.',
          body:
            'tickmcp is an open source remote MCP server for TickTick, maintained by Mahesh Rijal. The project is designed for practical interoperability across MCP clients and dependable OAuth handling on Cloudflare Workers. The primary goal is operational clarity: one endpoint contract, explicit auth flow behavior, and transparent source code. The repository documents current capabilities, known limitations, and implementation details so teams can evaluate fit before integrating. Development emphasizes conservative defaults for auth and request handling, along with clear release history for production users.',
        }
      : page === 'contact'
        ? {
            title: 'Contact and Support Channels',
            description: 'How to contact tickmcp maintainers for support, issues, collaboration, and responsible disclosure.',
            body:
              'For support, issue reports, and project discussion, use the public GitHub repository issues and discussions. That channel is preferred for reproducible bugs, feature requests, and implementation questions because it keeps context visible for future contributors. Security-sensitive concerns should be disclosed privately to the maintainer instead of public issue threads. When reporting issues, include endpoint path, request method, status code, and timestamp so maintainers can triage quickly and avoid unnecessary back and forth.',
          }
        : {
            title: 'Privacy and Data Handling',
            description: 'Privacy summary for tickmcp, covering OAuth token handling, request data usage, and operational retention.',
            body:
              'tickmcp processes OAuth tokens and API requests required to connect TickTick with MCP clients. Data is handled for service operation, access control, and security monitoring. Token and request data are used only for service functionality and troubleshooting, not for unrelated profiling. Storage and retention behavior can change as the project evolves, so users should review repository documentation for current operational details. If your organization has strict governance requirements, validate deployment settings and retention expectations before production use.',
          };

  const canonicalUrl = `${baseUrl}/${page}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${content.title} | tickmcp</title>
  <meta name="description" content="${content.description}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${content.title} | tickmcp" />
  <meta property="og:description" content="${content.description}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:image" content="${baseUrl}/social-card.svg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${content.title} | tickmcp" />
  <meta name="twitter:description" content="${content.description}" />
  <meta name="twitter:image" content="${baseUrl}/social-card.svg" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="canonical" href="${canonicalUrl}" />
  <style>
    body{margin:0;padding:2rem;font-family:ui-sans-serif,system-ui,sans-serif;background:#111214;color:#f7f3e8;line-height:1.6}
    main{max-width:760px;margin:0 auto}
    h1{font-size:2rem;line-height:1.2;margin:0 0 1rem}
    p{font-size:1rem;color:#d5ccbb}
    a{color:#f0b44d}
    nav{margin-top:1.25rem;font-size:.95rem}
  </style>
</head>
<body>
  <main>
    <h1>${content.title}</h1>
    <p>${content.body}</p>
    <nav>
      <a href="/">Home</a> ·
      <a href="/about">About</a> ·
      <a href="/contact">Contact</a> ·
      <a href="/privacy">Privacy</a>
    </nav>
  </main>
</body>
</html>`;
}

function robotsTxt(baseUrl: string): string {
  return `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;
}

function sitemapXml(baseUrl: string): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc><lastmod>${now}</lastmod></url>
  <url><loc>${baseUrl}/about</loc><lastmod>${now}</lastmod></url>
  <url><loc>${baseUrl}/contact</loc><lastmod>${now}</lastmod></url>
  <url><loc>${baseUrl}/privacy</loc><lastmod>${now}</lastmod></url>
</urlset>`;
}

function homepageHtml(baseUrl: string): string {
  const safeBase = baseUrl
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return HOMEPAGE_HTML_TEMPLATE.replaceAll('__BASE_URL__', safeBase);
}

function securityHeaders(contentType: string): Record<string, string> {
  return {
    'content-type': contentType,
    'cache-control': 'public, max-age=300',
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  };
}

function oauthProtectedResourceMetadata(baseUrl: string): string {
  const mcpResource = new URL('/mcp', baseUrl).toString();
  return JSON.stringify({
    resource: mcpResource,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    scopes_supported: ['tasks:read', 'tasks:write'],
  });
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

    if (request.method === 'GET' && ['/about', '/contact', '/privacy'].includes(url.pathname)) {
      const page = url.pathname.slice(1) as 'about' | 'contact' | 'privacy';
      return new Response(legalPageHtml(baseUrl, page), {
        status: 200,
        headers: securityHeaders('text/html; charset=utf-8'),
      });
    }

    if (request.method === 'GET' && url.pathname === '/robots.txt') {
      return new Response(robotsTxt(baseUrl), {
        status: 200,
        headers: securityHeaders('text/plain; charset=utf-8'),
      });
    }

    if (request.method === 'GET' && url.pathname === '/sitemap.xml') {
      return new Response(sitemapXml(baseUrl), {
        status: 200,
        headers: securityHeaders('application/xml; charset=utf-8'),
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

    if (request.method === 'GET' && url.pathname === '/social-card.svg') {
      return new Response(socialCardSvg(), {
        status: 200,
        headers: {
          ...securityHeaders('image/svg+xml; charset=utf-8'),
          'cache-control': 'public, max-age=86400',
        },
      });
    }

    if (request.method === 'GET' && url.pathname === '/favicon.ico') {
      return Response.redirect(`${baseUrl}/favicon.svg`, 302);
    }

    if (request.method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource') {
      return new Response(oauthProtectedResourceMetadata(baseUrl), {
        status: 200,
        headers: securityHeaders('application/json; charset=utf-8'),
      });
    }

    if (request.method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource/mcp') {
      return new Response(oauthProtectedResourceMetadata(baseUrl), {
        status: 200,
        headers: securityHeaders('application/json; charset=utf-8'),
      });
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

  try {
    // Exchange code for TickTick tokens
    const redirectUri = `${baseUrl}/callback`;
    const tokenResponse = await exchangeTickTickCode(code, stored.codeVerifier, redirectUri, env);

    if (!tokenResponse.access_token) {
      return new Response('TickTick token response is missing access token', { status: 502 });
    }

    // Derive a stable user subject from the access token (TickTick Open API has no user info endpoint)
    const subject = await deriveSubjectFromToken(tokenResponse.access_token);

    // Ensure user exists in D1
    const usersRepo = new UsersRepository(env.DB);
    const user = await usersRepo.ensureBySubject(subject);

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
      metadata: { label: 'TickTick' },
      scope: stored.mcpOAuthRequest.scope ?? [],
      props,
    });

    return Response.redirect(redirectTo, 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const details = err instanceof Error ? err.stack : undefined;
    console.error('OAuth callback failed', { error: message, stack: details });
    return new Response('Authorization failed', { status: 502 });
  }
}
