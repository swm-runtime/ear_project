export interface RecordAuditLogCommand {
  actor: string;
  action: string;
  target: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}
