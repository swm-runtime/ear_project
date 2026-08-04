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

  async saveSubscriptions(
    archived: ArchivedSubscription[],
    manager?: EntityManager,
  ): Promise<ArchivedSubscription[]> {
    const repository = manager
      ? manager.getRepository(ArchivedSubscription)
      : this.archivedSubscriptionRepository;
    return repository.save(archived);
  }
}
