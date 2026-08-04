import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { WithdrawalLog } from '../entities/withdrawal-log.entity';

@Injectable()
export class WithdrawalLogRepository {
  constructor(
    @InjectRepository(WithdrawalLog)
    private readonly repository: Repository<WithdrawalLog>,
  ) {}

  private scoped(manager?: EntityManager): Repository<WithdrawalLog> {
    return manager ? manager.getRepository(WithdrawalLog) : this.repository;
  }

  create(log: Partial<WithdrawalLog>): WithdrawalLog {
    return this.repository.create(log);
  }

  async save(
    log: WithdrawalLog,
    manager?: EntityManager,
  ): Promise<WithdrawalLog> {
    return this.scoped(manager).save(log);
  }
}
