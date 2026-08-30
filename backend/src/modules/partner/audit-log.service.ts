import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { AuditLog } from './audit-log.entity';
import { AuditLogRepository } from './audit-log.repository';
import { RecordAuditLogCommand } from './partner.types';

/**
 * admin.md 4.1 — 관리자 행위(업로드·회수·주제 변경)는 전부 여기로 남긴다.
 * 행위와 같은 트랜잭션(`manager`) 안에서 기록해야 "행위는 됐는데 기록이 없는" 상태가 없다.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  async record(
    command: RecordAuditLogCommand,
    manager?: EntityManager,
  ): Promise<AuditLog> {
    const auditLog = new AuditLog();
    auditLog.actor = command.actor;
    auditLog.action = command.action;
    auditLog.target = command.target;
    auditLog.before = command.before ?? null;
    auditLog.after = command.after ?? null;

    return this.auditLogRepository.save(auditLog, manager);
  }
}
