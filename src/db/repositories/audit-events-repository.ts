export class AuditEventsRepository {
  constructor(private readonly db: D1Database) {}

  async insert(params: {
    userId: string;
    eventType: string;
    status: string;
    detail?: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO audit_events (id, user_id, event_type, status, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        params.userId,
        params.eventType,
        params.status,
        params.detail ?? null,
        new Date().toISOString(),
      )
      .run();
  }
}
