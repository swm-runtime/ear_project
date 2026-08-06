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

  /** 상위 티어 존재 여부 판정용 — 판매 중인 요금제만 센다 */
  async findAllActive(manager?: EntityManager): Promise<Plan[]> {
    return this.scoped(manager).find({
      where: { isActive: true },
      order: { displayOrder: 'ASC' },
    });
  }
}
