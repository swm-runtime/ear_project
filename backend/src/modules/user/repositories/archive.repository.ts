import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { ArchivedConsent } from '../entities/archived-consent.entity';
import { ArchivedSubscription } from '../entities/archived-subscription.entity';
import { ArchivedUser } from '../entities/archived-user.entity';

/**
 * domain.md 11장 — 보존 아카이브(`archive` 스키마) 전용 Repository.
 * append-only이며, 일반 조회 경로에서 읽지 않는다.
 */
@Injectable()
export class ArchiveRepository {
  constructor(
    @InjectRepository(ArchivedUser)
    private readonly archivedUserRepository: Repository<ArchivedUser>,
    @InjectRepository(ArchivedConsent)
    private readonly archivedConsentRepository: Repository<ArchivedConsent>,
    @InjectRepository(ArchivedSubscription)
    private readonly archivedSubscriptionRepository: Repository<ArchivedSubscription>,
  ) {}

  createUser(archived: Partial<ArchivedUser>): ArchivedUser {
    return this.archivedUserRepository.create(archived);
  }

  createConsent(archived: Partial<ArchivedConsent>): ArchivedConsent {
    return this.archivedConsentRepository.create(archived);
  }

  createSubscription(
    archived: Partial<ArchivedSubscription>,
  ): ArchivedSubscription {
    return this.archivedSubscriptionRepository.create(archived);
  }

  async saveUser(
    archived: ArchivedUser,
    manager?: EntityManager,
  ): Promise<ArchivedUser> {
    const repository = manager
      ? manager.getRepository(ArchivedUser)
      : this.archivedUserRepository;
    return repository.save(archived);
  }

  async saveConsents(
    archived: ArchivedConsent[],
    manager?: EntityManager,
  ): Promise<ArchivedConsent[]> {
    const repository = manager
      ? manager.getRepository(ArchivedConsent)
      : this.archivedConsentRepository;
    return repository.save(archived);
  }

  /**
   * 구독 이력 보존(5년). **같은 계정의 같은 거래는 한 줄이다** —
   * `uq_archived_subscriptions_user_hash_original_transaction_id`.
   *
   * 충돌을 무시한다. 탈퇴는 되돌릴 수 없는 작업이라, 이미 같은 행이 있다는 이유로
   * **트랜잭션 전체를 롤백시켜 파기를 막으면 안 된다**(architecture.md 8.4 — 유니크 위반을
   * 도메인 흐름으로 흡수한다). 정상 경로에서는 도달하지 않는다 — 한 계정의 `subscriptions`도
   * `original_transaction_id`가 유니크라 같은 값이 두 번 오지 않는다.
   */
  async saveSubscriptions(
    archived: ArchivedSubscription[],
    manager?: EntityManager,
  ): Promise<void> {
    if (archived.length === 0) {
      return;
    }

    const repository = manager
      ? manager.getRepository(ArchivedSubscription)
      : this.archivedSubscriptionRepository;

    await repository
      .createQueryBuilder()
      .insert()
      .values(archived)
      .orIgnore()
      .execute();
  }
}
