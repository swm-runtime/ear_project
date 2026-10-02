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

  async findById(id: string, manager?: EntityManager): Promise<Plan | null> {
    return this.scoped(manager).findOneBy({ id });
  }

  /**
   * 스토어 상품 ID → 요금제. **비활성 요금제도 찾는다** — 판매를 멈춘 요금제의 기존 구독자는 만료까지
   * 유지되고(`subscription.md` 7), 그 갱신 알림도 같은 상품 ID로 온다.
   */
  async findByIosProductId(
    productId: string,
    manager?: EntityManager,
  ): Promise<Plan | null> {
    return this.scoped(manager).findOneBy({ storeProductIdIos: productId });
  }

  async findByAndroidProductId(
    productId: string,
    manager?: EntityManager,
  ): Promise<Plan | null> {
    return this.scoped(manager).findOneBy({ storeProductIdAndroid: productId });
  }

  /** 상위 티어 존재 여부 판정용 — 판매 중인 요금제만 센다 */
  async findAllActive(manager?: EntityManager): Promise<Plan[]> {
    return this.scoped(manager).find({
      where: { isActive: true },
      order: { displayOrder: 'ASC' },
    });
  }
}
