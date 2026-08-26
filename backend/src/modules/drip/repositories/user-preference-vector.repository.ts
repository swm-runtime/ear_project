import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { UserPreferenceVector } from '../entities/user-preference-vector.entity';

@Injectable()
export class UserPreferenceVectorRepository {
  constructor(
    @InjectRepository(UserPreferenceVector)
    private readonly repository: Repository<UserPreferenceVector>,
  ) {}

  private scoped(manager?: EntityManager): Repository<UserPreferenceVector> {
    return manager
      ? manager.getRepository(UserPreferenceVector)
      : this.repository;
  }

  async findByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<UserPreferenceVector | null> {
    return this.scoped(manager).findOneBy({ userId });
  }

  /**
   * 사용자당 1행(`uq_user_preference_vectors_user_id`)의 **전체 교체 upsert**다.
   * 파생 캐시라 병합할 이유가 없다 — 매 배치가 원천(`user_signals`)에서 다시 계산한다
   * (domain.md 7.2).
   */
  async upsert(
    vector: Partial<UserPreferenceVector>,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      .values(vector)
      .orUpdate(
        [
          'topic_weights',
          'author_weights',
          'keyword_weights',
          'format_weights',
          'duration_pref',
          'signal_count',
          'updated_at',
        ],
        'uq_user_preference_vectors_user_id',
      )
      .execute();
  }

  async deleteByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ userId });
  }
}
