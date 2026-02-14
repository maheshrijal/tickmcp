import { Props } from './props';
import { Env } from '../types/env';

const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource/mcp';

export function buildResourceMetadataUrl(request: Request, env: Env): string {
  const requestUrl = new URL(request.url);
  const baseUrl = (env.PUBLIC_BASE_URL ?? requestUrl.origin).replace(/\/$/, '');
  return `${baseUrl}${PROTECTED_RESOURCE_PATH}`;
}

export function withOAuthChallengeMetadata(response: Response, request: Request, env: Env): Response {
  if (response.status !== 401) {
    return response;
  }

  const challenge = response.headers.get('www-authenticate');
  if (!challenge || !/^Bearer/i.test(challenge) || challenge.includes('resource_metadata=')) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('www-authenticate', `${challenge}, resource_metadata="${buildResourceMetadataUrl(request, env)}"`);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function tokenExchangeCallback({
  props,
  userId,
  grantType,
  clientId,
}: {
  props?: Props;
  userId: string;
  grantType?: string;
  clientId?: string;
}): { accessTokenProps: Props; newProps: Props } {
  console.log('tokenExchangeCallback invoked', {
    grantType: grantType ?? 'unknown',
    clientId: clientId ?? 'unknown',
    hasProps: Boolean(props),
    hasUserIdInProps: Boolean(props?.userId),
    callbackUserIdPresent: Boolean(userId),
  });
  const resolvedProps = props?.userId ? props : { userId };
  // Keep both token props and grant props aligned so refreshed tokens retain required auth props.
  return { accessTokenProps: resolvedProps, newProps: resolvedProps };
}
