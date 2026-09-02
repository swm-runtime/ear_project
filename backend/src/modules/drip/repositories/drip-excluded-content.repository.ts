import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { DripExcludedContent } from '../entities/drip-excluded-content.entity';

@Injectable()
export class DripExcludedContentRepository {
  constructor(
    @InjectRepository(DripExcludedContent)
    private readonly repository: Repository<DripExcludedContent>,
  ) {}

  private scoped(manager?: EntityManager): Repository<DripExcludedContent> {
    return manager
      ? manager.getRepository(DripExcludedContent)
      : this.repository;
  }

  async findAllContentIdsByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('excluded')
      .select('excluded.content_id', 'content_id')
      .where('excluded.user_id = :userId', { userId })
      .getRawMany<{ content_id: string }>();

    return rows.map((row) => row.content_id);
  }

  /**
   * 이미 행이 있으면 **최초 사유를 유지한다**(domain.md 7.1 — upsert 시 갱신하지 않음).
   * 유니크 위반은 예외로 만들지 않고 흡수한다(architecture.md 8.4).
   */
  async insertIgnoringConflicts(
    exclusions: Partial<DripExcludedContent>[],
    manager?: EntityManager,
  ): Promise<void> {
    if (exclusions.length === 0) {
      return;
    }

    await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      .into(DripExcludedContent)
      .values(exclusions)
      .orIgnore()
      .execute();
  }

  async deleteByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ userId });
  }
}
