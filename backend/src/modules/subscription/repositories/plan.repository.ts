import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { UserTier } from '@/modules/user/user.enum';

import { Plan } from '../entities/plan.entity';

@Injectable()
export class PlanRepository {
  constructor(
    @InjectRepository(Plan)
    private readonly repository: Repository<Plan>,
  ) {}

  private scoped(manager?: EntityManager): Repository<Plan> {
    return manager ? manager.getRepository(Plan) : this.repository;
  }

  async findByTier(
    tier: UserTier,
    manager?: EntityManager,
  ): Promise<Plan | null> {
    return this.scoped(manager).findOneBy({ tier });
  }
}
