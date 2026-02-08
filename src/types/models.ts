export interface UserRecord {
  id: string;
  mcpSubject: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEventRecord {
  id: string;
  userId: string;
  eventType: string;
  status: string;
  detail: string | null;
  createdAt: string;
}

export interface TickTickTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
}

export interface TickTickTask {
  id: string;
  projectId: string;
  title: string;
  content?: string;
  dueDate?: string;
  startDate?: string;
  status?: number;
  priority?: number;
  timeZone?: string;
  isAllDay?: boolean;
}

export interface TickTickProject {
  id: string;
  name: string;
  color?: string;
  viewMode?: string;
  closed?: boolean;
}
