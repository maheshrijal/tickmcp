type UserRow = {
  id: string;
  mcp_subject: string;
  created_at: string;
  updated_at: string;
};

type AuditRow = {
  id: string;
  user_id: string;
  event_type: string;
  status: string;
  detail: string | null;
  created_at: string;
};

type OAuthStateRow = {
  state: string;
  mcp_oauth_request: string;
  code_verifier: string;
  expires_at: string;
  created_at: string;
};

class MemoryD1PreparedStatement {
  private params: unknown[] = [];

  constructor(
    private readonly db: MemoryD1Database,
    private readonly sql: string,
  ) {}

  bind(...args: unknown[]): MemoryD1PreparedStatement {
    this.params = args;
    return this;
  }

  async run(): Promise<D1Result<Record<string, never>>> {
    const changes = this.db.run(this.sql, this.params);
    return {
      success: true,
      results: [],
      meta: { duration: 0, rows_read: 0, rows_written: changes, changes, last_row_id: 0, changed_db: changes > 0, size_after: 0 },
    };
  }

  async first<T = unknown>(): Promise<T | null> {
    return this.db.first(this.sql, this.params) as T | null;
  }
}

export class MemoryD1Database {
  private readonly usersById = new Map<string, UserRow>();
  private readonly usersBySubject = new Map<string, string>();
  private readonly auditEvents: AuditRow[] = [];
  private readonly oauthStates = new Map<string, OAuthStateRow>();
  private readonly idempotencyKeys = new Map<string, string>();

  prepare(query: string): D1PreparedStatement {
    return new MemoryD1PreparedStatement(this, query) as unknown as D1PreparedStatement;
  }

  private normalize(sql: string): string {
    return sql.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  run(sql: string, params: unknown[]): number {
    const normalized = this.normalize(sql);

    if (normalized.startsWith('insert into users') || normalized.startsWith('insert or ignore into users')) {
      const [id, mcpSubject, createdAt, updatedAt] = params as [string, string, string, string];
      if (this.usersBySubject.has(mcpSubject)) {
        return 0;
      }
      this.usersById.set(id, { id, mcp_subject: mcpSubject, created_at: createdAt, updated_at: updatedAt });
      this.usersBySubject.set(mcpSubject, id);
      return 1;
    }

    if (normalized.startsWith('insert into audit_events')) {
      const [id, userId, eventType, status, detail, createdAt] = params as [
        string,
        string,
        string,
        string,
        string | null,
        string,
      ];
      this.auditEvents.push({
        id,
        user_id: userId,
        event_type: eventType,
        status,
        detail,
        created_at: createdAt,
      });
      return 1;
    }

    if (normalized.startsWith('insert into oauth_states')) {
      const [state, mcpOAuthRequest, codeVerifier, expiresAt, createdAt] = params as [
        string,
        string,
        string,
        string,
        string,
      ];
      this.oauthStates.set(state, {
        state,
        mcp_oauth_request: mcpOAuthRequest,
        code_verifier: codeVerifier,
        expires_at: expiresAt,
        created_at: createdAt,
      });
      return 1;
    }

    if (normalized.startsWith('delete from idempotency_keys')) {
      const [cutoff] = params as [string];
      let deleted = 0;
      for (const [composite, createdAt] of this.idempotencyKeys) {
        if (createdAt < cutoff) {
          this.idempotencyKeys.delete(composite);
          deleted++;
        }
      }
      return deleted;
    }

    if (normalized.startsWith('insert into idempotency_keys')) {
      const [userId, operation, key, createdAt] = params as [string, string, string, string];
      const composite = `${userId}:${operation}:${key}`;
      if (this.idempotencyKeys.has(composite)) {
        throw new Error('UNIQUE constraint failed: idempotency_keys.user_id, idempotency_keys.operation, idempotency_keys.key');
      }
      this.idempotencyKeys.set(composite, createdAt);
      return 1;
    }

    throw new Error(`Unsupported run SQL: ${sql}`);
  }

  first(sql: string, params: unknown[]): unknown | null {
    const normalized = this.normalize(sql);

    if (normalized.startsWith('select * from users where mcp_subject =')) {
      const [subject] = params as [string];
      const id = this.usersBySubject.get(subject);
      if (!id) {
        return null;
      }

      return this.usersById.get(id) ?? null;
    }

    if (normalized.startsWith('delete from oauth_states')) {
      const [state, nowIso] = params as [string, string];
      const entry = this.oauthStates.get(state);
      if (!entry) {
        return null;
      }
      if (entry.expires_at <= nowIso) {
        return null;
      }
      this.oauthStates.delete(state);
      return entry;
    }

    throw new Error(`Unsupported first SQL: ${sql}`);
  }

  getAuditEvents(): AuditRow[] {
    return [...this.auditEvents];
  }
}
