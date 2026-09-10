import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, MoreThan, Repository } from 'typeorm';

import { isUniqueViolation } from '@/common/utils/unique-violation.util';

import { EmailVerification } from '../entities/email-verification.entity';

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
      if (isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
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

  /**
   * 검증 시도 카운트를 **원자적으로** 올린다 — `attempt_count < limit`일 때만 증가하고 증가 후
   * 값을 돌려준다. 상한에 이미 닿아 있으면 `null`.
   *
   * read-modify-write(`attemptCount += 1` 후 save)는 동시 요청이 같은 값을 읽어 증가를 잃었다 —
   * 6자리 코드의 유일한 브루트포스 방어가 이 상한이라 병렬 제출로 우회되면 안 된다(2026-09-09 감사).
   */
  async incrementAttemptIfBelow(
    id: string,
    limit: number,
    attemptedAt: Date,
    manager?: EntityManager,
  ): Promise<number | null> {
    const result = await this.scoped(manager)
      .createQueryBuilder()
      .update(EmailVerification)
      .set({
        attemptCount: () => 'attempt_count + 1',
        lastAttemptedAt: attemptedAt,
      })
      .where('id = :id', { id })
      .andWhere('attempt_count < :limit', { limit })
      .returning('attempt_count')
      .execute();

    const raw = (result.raw as { attempt_count: number }[])[0];
    return raw ? Number(raw.attempt_count) : null;
  }

  /**
   * 인증 성공 시 같은 사용자의 **다른** 활성 인증을 전부 무효화한다 — 두 주소로 코드를 받아
   * 하나를 인증한 뒤 3분 안에 다른 주소를 인증해 잠긴 주소를 덮어쓰는 경로를 막는다
   * (`auth.md` 4.4가 기각한 "새 주소 인증으로 변경" — 2026-09-09 감사).
   */
  async invalidateOtherActiveByUserId(
    userId: string,
    exceptId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<number> {
    const result = await this.scoped(manager)
      .createQueryBuilder()
      .update(EmailVerification)
      .set({ invalidatedAt: now })
      .where('user_id = :userId', { userId })
      .andWhere('id != :exceptId', { exceptId })
      .andWhere('verified_at IS NULL')
      .andWhere('invalidated_at IS NULL')
      .execute();

    return result.affected ?? 0;
  }

  /**
   * 만료 후 보존 기한이 지난 행을 지운다 — domain.md 3.7·12.1 "만료 24시간 후 hard delete"의
   * 실제 집행 경로(`idx_email_verifications_expires_at` 사용). 이메일 주소가 든 행이라
   * 청소가 아니라 파기 의무 이행이다.
   */
  async deleteExpiredBefore(
    threshold: Date,
    manager?: EntityManager,
  ): Promise<number> {
    const result = await this.scoped(manager)
      .createQueryBuilder()
      .delete()
      .from(EmailVerification)
      .where('expires_at < :threshold', { threshold })
      .execute();

    return result.affected ?? 0;
  }

  async deleteById(id: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ id });
  }

  async deleteByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ userId });
  }
}
