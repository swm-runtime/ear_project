import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { ALL_TIME_PERIOD_START, ContentStatus } from '../content.enum';
import { ContentCandidateQuery } from '../content.types';
import { Content } from '../entities/content.entity';

@Injectable()
export class ContentRepository {
  constructor(
    @InjectRepository(Content)
    private readonly repository: Repository<Content>,
  ) {}

  private scoped(manager?: EntityManager): Repository<Content> {
    return manager ? manager.getRepository(Content) : this.repository;
  }

  async findById(id: string, manager?: EntityManager): Promise<Content | null> {
    return this.scoped(manager).findOneBy({ id });
  }

  async findAllByIds(
    ids: string[],
    manager?: EntityManager,
  ): Promise<Content[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.scoped(manager).findBy({ id: In(ids) });
  }

  /**
   * 추천·편성 후보를 인기·신선도 순으로 조회한다.
   *
   * 콜드스타트(FR-17) 규칙이라 전체 구간(`period_type = all`) 재생 수를 1순위,
   * `published_at`을 2순위로 쓴다. 마지막 `id` 정렬은 **동점 구간의 순서를 고정**하기
   * 위한 것이다 — 순서가 흔들리면 재진입 시 같은 9건을 보장할 수 없다
   * (onboarding-api.md 4.5).
   *
   * 정렬용 집계는 조회 안에서 조인으로 해결한다(architecture.md 3.4 — Service에서
   * 루프 조회하지 않는다).
   */
  async findCandidates(
    query: ContentCandidateQuery,
    manager?: EntityManager,
  ): Promise<Content[]> {
    const builder = this.scoped(manager)
      .createQueryBuilder('content')
      .leftJoin(
        'content_stats',
        'stat',
        'stat.content_id = content.id AND stat.period_type = :allPeriod AND stat.period_start = :allPeriodStart',
        { allPeriod: 'all', allPeriodStart: ALL_TIME_PERIOD_START },
      )
      .where('content.status = :status', { status: ContentStatus.PUBLISHED })
      .andWhere(
        '(content.license_expires_at IS NULL OR content.license_expires_at > :now)',
        { now: query.now },
      );

    if (query.seriesStartOnly) {
      builder.andWhere(
        '(content.episode_no IS NULL OR content.episode_no = 1)',
      );
    }

    if (query.includeTopicIds && query.includeTopicIds.length > 0) {
      builder.andWhere(
        `EXISTS (
           SELECT 1 FROM content_topics included
           WHERE included.content_id = content.id
             AND included.topic_id IN (:...includeTopicIds)
         )`,
        { includeTopicIds: query.includeTopicIds },
      );
    }

    if (query.excludeTopicIds && query.excludeTopicIds.length > 0) {
      builder.andWhere(
        `NOT EXISTS (
           SELECT 1 FROM content_topics excluded
           WHERE excluded.content_id = content.id
             AND excluded.topic_id IN (:...excludeTopicIds)
         )`,
        { excludeTopicIds: query.excludeTopicIds },
      );
    }

    if (query.excludeContentIds && query.excludeContentIds.length > 0) {
      builder.andWhere('content.id NOT IN (:...excludeContentIds)', {
        excludeContentIds: query.excludeContentIds,
      });
    }

    return builder
      .orderBy('COALESCE(stat.play_count, 0)', 'DESC')
      .addOrderBy('content.published_at', 'DESC')
      .addOrderBy('content.id', 'ASC')
      .limit(query.limit)
      .getMany();
  }

  async saveAll(
    contents: Content[],
    manager?: EntityManager,
  ): Promise<Content[]> {
    return this.scoped(manager).save(contents);
  }

  create(content: Partial<Content>): Content {
    return this.repository.create(content);
  }
}
