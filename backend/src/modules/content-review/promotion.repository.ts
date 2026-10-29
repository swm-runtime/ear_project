import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, MoreThan, Repository } from 'typeorm';

import { PromotionKind } from './content-review.enum';
import { AdminPromotionCounts } from './content-review.types';
import { Promotion } from './entities/promotion.entity';

export type PromotionDraft = Pick<
  Promotion,
  'userId' | 'kind' | 'tier' | 'grantDays' | 'issuedAt' | 'expiresAt'
>;

interface CountRow {
  issued: number;
  redeemed: number;
  expired: number;
  unused: number;
}

@Injectable()
export class PromotionRepository {
  constructor(
    @InjectRepository(Promotion)
    private readonly repository: Repository<Promotion>,
  ) {}

  private scoped(manager?: EntityManager): Repository<Promotion> {
    return manager ? manager.getRepository(Promotion) : this.repository;
  }

  async existsByUserIdAndKind(
    userId: string,
    kind: PromotionKind,
    manager?: EntityManager,
  ): Promise<boolean> {
    return this.scoped(manager).existsBy({ userId, kind });
  }

  /**
   * `INSERT … ON CONFLICT (user_id, kind) DO NOTHING` — 두 기기의 동시 3번째 후기에도 1장이다. **행을 만든 요청만** 행을 받는다
   * (나머지는 `null` — "이번 저장으로 발급됨"을 응답하지 않는다, domain.md 8.7).
   */
  async insertIfAbsent(
    draft: PromotionDraft,
    manager?: EntityManager,
  ): Promise<Promotion | null> {
    const result = await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      .into(Promotion)
      .values(draft)
      .orIgnore()
      .returning('id')
      .execute();
    const id = (result.raw as { id: string }[])[0]?.id;

    return id === undefined
      ? null
      : this.scoped(manager).findOneByOrFail({ id });
  }

  /** 쓰지 않았고 소멸 전인 프로모션 — 발급 최신순(`content-review-api.md` 4.6) */
  async findUsableByUserId(
    userId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<Promotion[]> {
    return this.scoped(manager).find({
      where: { userId, redeemedAt: IsNull(), expiresAt: MoreThan(now) },
      order: { issuedAt: 'DESC', id: 'DESC' },
    });
  }

  /** 사용 판정용 잠금 — 사용자 행 다음에 잡는다(8.6 잠금 순서) */
  async lockById(
    id: string,
    manager: EntityManager,
  ): Promise<Promotion | null> {
    return manager.getRepository(Promotion).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async save(promotion: Promotion, manager: EntityManager): Promise<Promotion> {
    return manager.getRepository(Promotion).save(promotion);
  }

  /** 관리자 건수(4.8) — 탈퇴로 파기된 행은 이미 없다. 소멸 = 쓰지 않았고 `expires_at ≤ now` */
  async countByKind(
    kind: PromotionKind,
    now: Date,
    manager?: EntityManager,
  ): Promise<AdminPromotionCounts> {
    const rows: CountRow[] = await this.scoped(manager).query(
      `SELECT count(*)::int AS issued,
              count(*) FILTER (WHERE redeemed_at IS NOT NULL)::int AS redeemed,
              count(*) FILTER (WHERE redeemed_at IS NULL AND expires_at <= $2)::int AS expired,
              count(*) FILTER (WHERE redeemed_at IS NULL AND expires_at > $2)::int AS unused
         FROM promotions
        WHERE kind = $1`,
      [kind, now],
    );
    const row = rows[0];

    return {
      issued: row?.issued ?? 0,
      redeemed: row?.redeemed ?? 0,
      expired: row?.expired ?? 0,
      unused: row?.unused ?? 0,
    };
  }
}
