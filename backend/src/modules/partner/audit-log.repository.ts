import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { AuditLog } from './audit-log.entity';

@Injectable()
export class AuditLogRepository {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repository: Repository<AuditLog>,
  ) {}

  private scoped(manager?: EntityManager): Repository<AuditLog> {
    return manager ? manager.getRepository(AuditLog) : this.repository;
  }

  async save(auditLog: AuditLog, manager?: EntityManager): Promise<AuditLog> {
    return this.scoped(manager).save(auditLog);
  }
}
