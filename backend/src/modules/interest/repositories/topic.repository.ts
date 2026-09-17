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

  /**
   * 행을 잠그고 읽는다 — 노출 판정(콘텐츠 건수)과 `is_visible` 갱신 사이에 다른 트랜잭션이
   * 끼어들지 못하게 한다(admin.md 4.5, KAN-58).
   *
   * **id 오름차순으로 잠근다.** 여러 주제를 잠그는 트랜잭션끼리 순서가 다르면 데드락이 된다.
   * `FOR NO KEY UPDATE`인 이유는 `ContentRepository.findByIdForUpdate`와 같다 — `content_topics` ·
   * `user_interests`의 FK 검사(`FOR KEY SHARE`)를 막지 않아 온보딩·업로드가 기다리지 않는다.
   */
  async findAllByIdsForUpdate(
    ids: string[],
    manager: EntityManager,
  ): Promise<Topic[]> {
    if (ids.length === 0) {
      return [];
    }

    return manager.getRepository(Topic).find({
      where: { id: In(ids) },
      order: { id: 'ASC' },
      lock: { mode: 'for_no_key_update' },
    });
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
