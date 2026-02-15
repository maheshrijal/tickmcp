import { type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { Props } from './props';
import { exchangeTickTickCode } from './ticktick-upstream';
import { OAuthStatesRepository, UsersRepository } from '../db/repositories';
import { Env } from '../types/env';
import { HOMEPAGE_HTML_TEMPLATE } from '../homepage/homepage-html';
import { SOCIAL_CARD_JPG_BASE64 } from '../homepage/social-card-jpg';

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

function getSiteBaseUrl(request: Request, env: Env): string {
  const host = request.headers.get('host')?.replace(/\/$/, '');
  const protocol = request.url.startsWith('https://') ? 'https' : 'http';
  const hostName = host?.split(':')[0] ?? '';
  const isLocal = hostName === 'localhost' || hostName === '127.0.0.1' || hostName === '::1';
  if (isLocal) {
    return `${protocol}://${host}`;
  }
  return getBaseUrl(request, env);
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

let socialCardJpgCache: ArrayBuffer | null = null;

function socialCardJpgBuffer(): ArrayBuffer {
  if (socialCardJpgCache) {
    return socialCardJpgCache;
  }
  const compact = SOCIAL_CARD_JPG_BASE64.replace(/\s+/g, '');
  const binary = atob(compact);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  socialCardJpgCache = bytes.buffer;
  return socialCardJpgCache;
}

function legalPageHtml(baseUrl: string, page: 'about' | 'contact' | 'privacy'): string {
  const publishedDate = '2026-02-15';
  const authorName = 'Mahesh Rijal';
  const content =
    page === 'about'
      ? {
          title: 'About tickmcp and Project Scope',
          description:
            'Detailed background on tickmcp, including project goals, architecture priorities, maintenance principles, and practical operating scope.',
          paragraphs: [
            'tickmcp is an open source remote MCP server for TickTick, maintained by Mahesh Rijal. The project is designed for practical interoperability across MCP clients and dependable OAuth handling on Cloudflare Workers. The primary goal is operational clarity: one endpoint contract, explicit auth flow behavior, and transparent source code.',
            'The repository documents current capabilities, known limitations, and implementation details so teams can evaluate fit before integrating. Development emphasizes conservative defaults for auth and request handling, along with clear release history for production users. The intended audience includes engineers, operators, and advanced users who need repeatable task automation with clear failure modes and auditable behavior in production-like environments.',
            'Project scope is intentionally focused on reliable core workflows instead of broad feature sprawl. That means stable endpoint contracts, well-defined error semantics, and straightforward onboarding paths are prioritized over cosmetic complexity. This discipline helps teams adopt the integration with confidence and reduce long-term operational surprises.',
          ],
        }
      : page === 'contact'
        ? {
            title: 'Contact and Support Channels',
            description:
              'Contact channels for tickmcp support, issue reporting, collaboration requests, and responsible security disclosure workflows.',
            paragraphs: [
              'For support, issue reports, and project discussion, use the public GitHub repository issues and discussions. That channel is preferred for reproducible bugs, feature requests, and implementation questions because it keeps context visible for future contributors.',
              'Security-sensitive concerns should be disclosed privately to the maintainer instead of public issue threads. When reporting issues, include endpoint path, request method, status code, and timestamp so maintainers can triage quickly and avoid unnecessary back and forth.',
              'If your report involves OAuth redirects or token handling behavior, include environment context and a minimal reproduction sequence so maintainers can isolate whether the issue is configuration, upstream provider behavior, or code-level regression. Clear diagnostics reduce turnaround time and improve the quality of follow-up fixes.',
            ],
          }
        : {
            title: 'Privacy and Data Handling',
            description:
              'Privacy summary for tickmcp covering OAuth token handling, request processing, storage boundaries, retention, and deployment responsibilities.',
            paragraphs: [
              'tickmcp processes OAuth tokens and API requests required to connect TickTick with MCP clients. Data is handled for service operation, access control, and security monitoring. Token and request data are used only for service functionality and troubleshooting, not for unrelated profiling.',
              'Storage and retention behavior can change as the project evolves, so users should review repository documentation for current operational details. If your organization has strict governance requirements, validate deployment settings and retention expectations before production use.',
              'Self-hosted deployments should review secret handling, logging destinations, and data lifecycle policies so infrastructure settings stay aligned with internal compliance obligations and incident response expectations. Organizations should apply their own legal and policy review before exposing any production integration endpoint.',
            ],
          };

  const canonicalUrl = `${baseUrl}/${page}`;
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${content.title} | tickmcp`,
    url: canonicalUrl,
    datePublished: publishedDate,
    dateModified: publishedDate,
    author: { '@type': 'Person', name: authorName },
    description: content.description,
  });
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
  <meta property="og:image" content="${baseUrl}/social-card.jpg" />
  <meta name="author" content="${authorName}" />
  <meta property="article:published_time" content="${publishedDate}" />
  <meta property="article:modified_time" content="${publishedDate}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${content.title} | tickmcp" />
  <meta name="twitter:description" content="${content.description}" />
  <meta name="twitter:image" content="${baseUrl}/social-card.jpg" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="canonical" href="${canonicalUrl}" />
  <script type="application/ld+json">${jsonLd}</script>
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
    <p><strong>Author:</strong> ${authorName} · <strong>Published:</strong> ${publishedDate}</p>
    <p>${content.paragraphs.join('</p><p>')}</p>
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
    const siteBaseUrl = getSiteBaseUrl(request, env);

    if (request.method === 'GET' && url.pathname === '/authorize') {
      return handleAuthorize(request, env, baseUrl);
    }

    if (request.method === 'GET' && url.pathname === '/callback') {
      return handleCallback(request, env, baseUrl);
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(homepageHtml(siteBaseUrl), {
        status: 200,
        headers: securityHeaders('text/html; charset=utf-8'),
      });
    }

    if (request.method === 'GET' && ['/about', '/contact', '/privacy'].includes(url.pathname)) {
      const page = url.pathname.slice(1) as 'about' | 'contact' | 'privacy';
      return new Response(legalPageHtml(siteBaseUrl, page), {
        status: 200,
        headers: securityHeaders('text/html; charset=utf-8'),
      });
    }

    if (request.method === 'GET' && url.pathname === '/robots.txt') {
      return new Response(robotsTxt(siteBaseUrl), {
        status: 200,
        headers: securityHeaders('text/plain; charset=utf-8'),
      });
    }

    if (request.method === 'GET' && url.pathname === '/sitemap.xml') {
      return new Response(sitemapXml(siteBaseUrl), {
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

    if (request.method === 'GET' && url.pathname === '/social-card.jpg') {
      return new Response(socialCardJpgBuffer(), {
        status: 200,
        headers: {
          ...securityHeaders('image/jpeg'),
          'cache-control': 'public, max-age=86400',
        },
      });
    }

    if (request.method === 'GET' && url.pathname === '/favicon.ico') {
      return Response.redirect(`${siteBaseUrl}/favicon.svg`, 302);
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
