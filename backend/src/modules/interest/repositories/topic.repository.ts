import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { escapeLikePattern } from '@/common/utils/search-text.util';

import { Topic } from '../entities/topic.entity';

@Injectable()
export class TopicRepository {
  constructor(
    @InjectRepository(Topic)
    private readonly repository: Repository<Topic>,
  ) {}

  private scoped(manager?: EntityManager): Repository<Topic> {
    return manager ? manager.getRepository(Topic) : this.repository;
  }

  /** onboarding-api.md 4.2 — `is_visible = true`만, `display_order` 오름차순 */
  async findAllVisible(manager?: EntityManager): Promise<Topic[]> {
    return this.scoped(manager).find({
      where: { isVisible: true },
      order: { displayOrder: 'ASC' },
    });
  }

  /** 노출 주제가 하나도 없을 때의 폴백 경로에서만 쓴다 (onboarding.md 7) */
  async findAll(manager?: EntityManager): Promise<Topic[]> {
    return this.scoped(manager).find({ order: { displayOrder: 'ASC' } });
  }

  async findAllByIds(ids: string[], manager?: EntityManager): Promise<Topic[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.scoped(manager).findBy({ id: In(ids) });
  }

  /**
   * 검색 빈 결과 fallback의 관련 주제(explore-api.md 4.5 — `related_topics`).
   *
   * 부분 문자열 포함(ILIKE — 양방향) 또는 `pg_trgm` 유사도(`similarity`)가 하한 이상인
   * 노출 주제를 유사도 순으로 돌려준다. **`topics.name`에는 인덱스가 없다**(domain.md
   * 5.1 — 주제 수십 개 수준이라 순차 스캔으로 충분). 질의는 호출부가 NFC·소문자로
   * 정규화했고, 대소문자는 ILIKE·pg_trgm이 흡수한다.
   */
  async findVisibleRelatedByName(
    normalizedQuery: string,
    similarityThreshold: number,
    limit: number,
    manager?: EntityManager,
  ): Promise<Topic[]> {
    return this.scoped(manager)
      .createQueryBuilder('topic')
      .where('topic.is_visible = true')
      .andWhere(
        `(topic.name ILIKE :pattern
          OR :query ILIKE '%' || topic.name || '%'
          OR similarity(topic.name, :query) >= :threshold)`,
        {
          pattern: `%${escapeLikePattern(normalizedQuery)}%`,
          query: normalizedQuery,
          threshold: similarityThreshold,
        },
      )
      .orderBy('similarity(topic.name, :query)', 'DESC')
      .addOrderBy('topic.display_order', 'ASC')
      .limit(limit)
      .getMany();
  }

  async findById(id: string, manager?: EntityManager): Promise<Topic | null> {
    return this.scoped(manager).findOneBy({ id });
  }

  async remove(topic: Topic, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).remove(topic);
  }

  async saveAll(topics: Topic[], manager?: EntityManager): Promise<Topic[]> {
    return this.scoped(manager).save(topics);
  }

  create(topic: Partial<Topic>): Topic {
    return this.repository.create(topic);
  }
}
