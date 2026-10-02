import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThan, Repository } from 'typeorm';

import { PurchaseIntent } from '../entities/purchase-intent.entity';
import { PurchaseIntentStatus } from '../subscription.enum';

export type PurchaseIntentDraft = Pick<
  PurchaseIntent,
  'userId' | 'planId' | 'platform'
>;

/** architecture.md 8.2 — 트랜잭션 컨텍스트는 마지막 인자로 받는다 */
@Injectable()
export class PurchaseIntentRepository {
  constructor(
    @InjectRepository(PurchaseIntent)
    private readonly repository: Repository<PurchaseIntent>,
  ) {}

  private scoped(manager?: EntityManager): Repository<PurchaseIntent> {
    return manager ? manager.getRepository(PurchaseIntent) : this.repository;
  }

  async create(
    draft: PurchaseIntentDraft,
    manager?: EntityManager,
  ): Promise<PurchaseIntent> {
    const repository = this.scoped(manager);

    return repository.save(
      repository.create({ ...draft, status: PurchaseIntentStatus.CREATED }),
    );
  }

  async findById(
    id: string,
    manager?: EntityManager,
  ): Promise<PurchaseIntent | null> {
    return this.scoped(manager).findOneBy({ id });
  }

  async updateStatus(
    id: string,
    status: PurchaseIntentStatus,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).update({ id }, { status });
  }

  /** 결제 시트를 닫아 `created`로 남은 행의 정리(domain.md 8.3) — 지운 행 수를 돌려준다 */
  async deleteCreatedBefore(
    before: Date,
    manager?: EntityManager,
  ): Promise<number> {
    const result = await this.scoped(manager).delete({
      status: PurchaseIntentStatus.CREATED,
      createdAt: LessThan(before),
    });

    return result.affected ?? 0;
  }
}
