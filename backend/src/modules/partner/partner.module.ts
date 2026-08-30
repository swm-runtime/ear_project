import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLog } from './audit-log.entity';
import { AuditLogRepository } from './audit-log.repository';
import { AuditLogService } from './audit-log.service';

/**
 * domain.md 2장 — `partners` · `content_control_requests` · `audit_logs`의 소유 모듈.
 * MVP에는 파트너 포털이 없어(partner-control.md 2) 지금은 감사 로그만 담는다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditLogRepository, AuditLogService],
  exports: [AuditLogService],
})
export class PartnerModule {}
