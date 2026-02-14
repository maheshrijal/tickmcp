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
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
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
