import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  IsNull,
  MoreThan,
  QueryFailedError,
  Repository,
} from 'typeorm';

import { EmailVerification } from '../entities/email-verification.entity';

/** Postgres unique_violation */
const UNIQUE_VIOLATION_CODE = '23505';

@Injectable()
export class EmailVerificationRepository {
  constructor(
    @InjectRepository(EmailVerification)
    private readonly repository: Repository<EmailVerification>,
  ) {}

  private scoped(manager?: EntityManager): Repository<EmailVerification> {
    return manager ? manager.getRepository(EmailVerification) : this.repository;
  }

  create(verification: Partial<EmailVerification>): EmailVerification {
    return this.repository.create(verification);
  }

  async save(
    verification: EmailVerification,
    manager?: EntityManager,
  ): Promise<EmailVerification> {
    return this.scoped(manager).save(verification);
  }

  /**
   * 활성 행이 이미 있으면 `uq_email_verifications_active`에 걸린다.
   * 동시 요청 두 건 중 하나가 여기서 걸러지며, 예외로 만들지 않고 `null`로 흡수한다
   * (architecture.md 8.4, domain.md 3.7).
   */
  async saveIfNoActive(
    verification: EmailVerification,
    manager?: EntityManager,
  ): Promise<EmailVerification | null> {
    try {
      return await this.scoped(manager).save(verification);
    } catch (error) {
      if (error instanceof QueryFailedError && this.isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  private isUniqueViolation(error: QueryFailedError): boolean {
    return (
      (error.driverError as { code?: string }).code === UNIQUE_VIOLATION_CODE
    );
  }

  /**
   * domain.md 3.7 — 발송 창 판정은 `(user_id, email)`의 **가장 최근 1행**만 보고 한다.
   * 동시 요청이 같은 `send_seq`를 만드는 것을 막기 위해 행 잠금을 건다.
   */
  async findLatestByUserIdAndEmailForUpdate(
    userId: string,
    email: string,
    manager: EntityManager,
  ): Promise<EmailVerification | null> {
    return manager
      .getRepository(EmailVerification)
      .createQueryBuilder('verification')
      .setLock('pessimistic_write')
      .where('verification.user_id = :userId', { userId })
      .andWhere('verification.email = :email', { email })
      .orderBy('verification.sent_at', 'DESC')
      .limit(1)
      .getOne();
  }

  /** 유효한 코드는 항상 마지막 1개다 (domain.md 3.7) */
  async findActiveByUserId(
    userId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<EmailVerification | null> {
    return this.scoped(manager).findOne({
      where: {
        userId,
        verifiedAt: IsNull(),
        invalidatedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
      order: { sentAt: 'DESC' },
    });
  }

  /**
   * 계정 단위 발송 상한(백스톱) 판정용 슬라이딩 집계 (domain.md 3.7).
   * 주소 무관 합산이며, 발송 실패 건은 행이 지워지므로 세지 않는다.
   */
  async countByUserIdSince(
    userId: string,
    since: Date,
    manager?: EntityManager,
  ): Promise<number> {
    return this.scoped(manager).count({
      where: { userId, sentAt: MoreThan(since) },
    });
  }

  async findByIdAndUserId(
    id: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<EmailVerification | null> {
    return this.scoped(manager).findOneBy({ id, userId });
  }

  async deleteById(id: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ id });
  }

  async deleteByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ userId });
  }
}
