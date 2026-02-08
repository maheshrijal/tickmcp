import { UserRecord } from '../../types/models';

interface UserRow {
  id: string;
  mcp_subject: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    mcpSubject: row.mcp_subject,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class UsersRepository {
  constructor(private readonly db: D1Database) {}

  async getBySubject(subject: string): Promise<UserRecord | null> {
    const result = await this.db.prepare('SELECT * FROM users WHERE mcp_subject = ?').bind(subject).first<UserRow>();
    return result ? mapRow(result) : null;
  }

  async ensureBySubject(subject: string): Promise<UserRecord> {
    const existing = await this.getBySubject(subject);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await this.db
      .prepare('INSERT OR IGNORE INTO users (id, mcp_subject, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .bind(id, subject, now, now)
      .run();

    const createdOrExisting = await this.getBySubject(subject);
    if (!createdOrExisting) {
      throw new Error('Failed to create or load user by subject');
    }

    return createdOrExisting;
  }
}
