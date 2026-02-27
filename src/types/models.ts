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
  desc?: string;
  items?: TickTickChecklistItem[];
  repeat?: string;
  repeatFlag?: string;
  dueDate?: string;
  startDate?: string;
  status?: number;
  priority?: number;
  sortOrder?: number;
  timeZone?: string;
  isAllDay?: boolean;
  reminders?: string[];
  kind?: TickTickTaskKind;
  completedTime?: string;
  createdTime?: string;
  modifiedTime?: string;
  tags?: string[];
}

export interface TickTickProject {
  id: string;
  name: string;
  color?: string;
  viewMode?: string;
  closed?: boolean;
}

export interface TickTickChecklistItem {
  id?: string;
  title: string;
  status?: number;
  completedTime?: string;
  sortOrder?: number;
  isAllDay?: boolean;
  startDate?: string;
  dueDate?: string;
  timeZone?: string;
}

export type TickTickTaskKind = 'TEXT' | 'NOTE' | 'CHECKLIST';

export interface TickTickProjectColumn {
  id: string;
  projectId?: string;
  name?: string;
  sortOrder?: number;
}
