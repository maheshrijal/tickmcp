import { AuthRequest } from '@cloudflare/workers-oauth-provider';

interface OAuthStateRow {
  state: string;
  mcp_oauth_request: string;
  code_verifier: string;
  expires_at: string;
}

export interface StoredOAuthState {
  mcpOAuthRequest: AuthRequest;
  codeVerifier: string;
}

export class OAuthStatesRepository {
  constructor(private readonly db: D1Database) {}

  async create(params: {
    state: string;
    mcpOAuthRequest: AuthRequest;
    codeVerifier: string;
    expiresAt: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO oauth_states (state, mcp_oauth_request, code_verifier, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        params.state,
        JSON.stringify(params.mcpOAuthRequest),
        params.codeVerifier,
        params.expiresAt,
        new Date().toISOString(),
      )
      .run();
  }

  async consume(state: string, nowIso: string): Promise<StoredOAuthState | null> {
    const row = await this.db
      .prepare(
        `DELETE FROM oauth_states
         WHERE state = ? AND expires_at > ?
         RETURNING state, mcp_oauth_request, code_verifier, expires_at`,
      )
      .bind(state, nowIso)
      .first<OAuthStateRow>();

    if (!row) {
      return null;
    }

    return {
      mcpOAuthRequest: JSON.parse(row.mcp_oauth_request) as AuthRequest,
      codeVerifier: row.code_verifier,
    };
  }
}
