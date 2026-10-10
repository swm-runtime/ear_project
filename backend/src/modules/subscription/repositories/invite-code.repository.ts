import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { InviteCodeRedemption } from '../entities/invite-code-redemption.entity';
import { InviteCode } from '../entities/invite-code.entity';

export type InviteCodeDraft = Pick<
  InviteCode,
  | 'code'
  | 'name'
  | 'tier'
  | 'grantDays'
  | 'grantUntilDate'
  | 'maxRedemptions'
  | 'redeemableFrom'
  | 'redeemableUntil'
>;

export type InviteCodeRedemptionDraft = Pick<
  InviteCodeRedemption,
  | 'inviteCodeId'
  | 'userId'
  | 'tier'
  | 'startsAt'
  | 'endsAt'
  | 'subscribedAtStart'
>;

/** 사용 중(지급 기간 안) 계정 수를 함께 실은 코드 — 관리자 목록용 */
export interface InviteCodeWithUsage {
  code: InviteCode;
  activeCount: number;
}

/** architecture.md 8.2 — 트랜잭션 컨텍스트는 마지막 인자로 받는다 */
@Injectable()
export class InviteCodeRepository {
  constructor(
    @InjectRepository(InviteCode)
    private readonly codeRepository: Repository<InviteCode>,
    @InjectRepository(InviteCodeRedemption)
    private readonly redemptionRepository: Repository<InviteCodeRedemption>,
  ) {}

  private codes(manager?: EntityManager): Repository<InviteCode> {
    return manager ? manager.getRepository(InviteCode) : this.codeRepository;
  }

  private redemptions(
    manager?: EntityManager,
  ): Repository<InviteCodeRedemption> {
    return manager
      ? manager.getRepository(InviteCodeRedemption)
      : this.redemptionRepository;
  }

  async createCode(
    draft: InviteCodeDraft,
    manager?: EntityManager,
  ): Promise<InviteCode> {
    const repository = this.codes(manager);
    return repository.save(repository.create(draft));
  }

  async saveCode(
    code: InviteCode,
    manager?: EntityManager,
  ): Promise<InviteCode> {
    return this.codes(manager).save(code);
  }

  async existsByCode(code: string, manager?: EntityManager): Promise<boolean> {
    return this.codes(manager).existsBy({ code });
  }

  /** 사용 한도·사용 수를 한 행 잠금으로 판정하려고 잠근다 — 같은 코드의 동시 입력이 한도를 넘지 않게 */
  async lockByCode(
    code: string,
    manager: EntityManager,
  ): Promise<InviteCode | null> {
    return manager.getRepository(InviteCode).findOne({
      where: { code },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async lockById(
    id: string,
    manager: EntityManager,
  ): Promise<InviteCode | null> {
    return manager.getRepository(InviteCode).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /** 관리자 목록 — 최근에 만든 순, 지급 중 계정 수를 함께 센다 */
  async findAllWithUsage(
    now: Date,
    manager?: EntityManager,
  ): Promise<InviteCodeWithUsage[]> {
    const codes = await this.codes(manager).find({
      order: { createdAt: 'DESC' },
    });
    if (codes.length === 0) {
      return [];
    }

    const rows: { invite_code_id: string; active_count: number }[] =
      await this.redemptions(manager)
        .createQueryBuilder('redemption')
        .select('redemption.invite_code_id', 'invite_code_id')
        .addSelect('COUNT(*)::int', 'active_count')
        .where('redemption.starts_at <= :now', { now })
        .andWhere('redemption.ends_at > :now', { now })
        .groupBy('redemption.invite_code_id')
        .getRawMany();
    const activeByCodeId = new Map(
      rows.map((row) => [row.invite_code_id, row.active_count]),
    );

    return codes.map((code) => ({
      code,
      activeCount: activeByCodeId.get(code.id) ?? 0,
    }));
  }

  async findRedemption(
    inviteCodeId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<InviteCodeRedemption | null> {
    return this.redemptions(manager).findOneBy({ inviteCodeId, userId });
  }

  /** 지금 지급 중인 행 — 한 계정에 동시에 하나만 있도록 입력이 막지만, 혹시 여럿이면 가장 늦게 끝나는 것 */
  async findActiveByUserId(
    userId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<(InviteCodeRedemption & { inviteCode: InviteCode }) | null> {
    const row = await this.redemptions(manager)
      .createQueryBuilder('redemption')
      .innerJoinAndSelect('redemption.inviteCode', 'inviteCode')
      .where('redemption.user_id = :userId', { userId })
      .andWhere('redemption.starts_at <= :now', { now })
      .andWhere('redemption.ends_at > :now', { now })
      .orderBy('redemption.ends_at', 'DESC')
      .getOne();

    return row;
  }

  async createRedemption(
    draft: InviteCodeRedemptionDraft,
    manager: EntityManager,
  ): Promise<InviteCodeRedemption> {
    const repository = manager.getRepository(InviteCodeRedemption);
    return repository.save(
      repository.create({ ...draft, tierReleasedAt: null }),
    );
  }

  async saveRedemption(
    redemption: InviteCodeRedemption,
    manager: EntityManager,
  ): Promise<InviteCodeRedemption> {
    return manager.getRepository(InviteCodeRedemption).save(redemption);
  }

  /** 기간이 끝났는데 `users.tier`를 아직 다시 맞추지 않은 행(만료 배치) */
  async findEndedUnreleased(
    now: Date,
    limit: number,
    manager?: EntityManager,
  ): Promise<InviteCodeRedemption[]> {
    return this.redemptions(manager)
      .createQueryBuilder('redemption')
      .where('redemption.tier_released_at IS NULL')
      .andWhere('redemption.ends_at <= :now', { now })
      .orderBy('redemption.ends_at', 'ASC')
      .limit(limit)
      .getMany();
  }
}
