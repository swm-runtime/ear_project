import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { ContentTopicView } from '../content.types';
import { ContentTopic } from '../entities/content-topic.entity';

interface ContentTopicRow {
  content_id: string;
  topic_id: string;
  name: string;
}

@Injectable()
export class ContentTopicRepository {
  constructor(
    @InjectRepository(ContentTopic)
    private readonly repository: Repository<ContentTopic>,
  ) {}

  private scoped(manager?: EntityManager): Repository<ContentTopic> {
    return manager ? manager.getRepository(ContentTopic) : this.repository;
  }

  /**
   * 여러 콘텐츠의 주제를 한 번에 읽는다.
   * 콘텐츠마다 조회하면 추천 9건에 9번 쿼리가 나간다(architecture.md 3.4 — N+1 회피).
   */
  async findViewsByContentIds(
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<ContentTopicView[]> {
    if (contentIds.length === 0) {
      return [];
    }

    const rows = await this.scoped(manager)
      .createQueryBuilder('content_topic')
      .innerJoin('topics', 'topic', 'topic.id = content_topic.topic_id')
      .select('content_topic.content_id', 'content_id')
      .addSelect('content_topic.topic_id', 'topic_id')
      .addSelect('topic.name', 'name')
      .where('content_topic.content_id IN (:...contentIds)', { contentIds })
      .orderBy('topic.display_order', 'ASC')
      .getRawMany<ContentTopicRow>();

    return rows.map((row) => ({
      contentId: row.content_id,
      topicId: row.topic_id,
      name: row.name,
    }));
  }

  /**
   * 주제별 콘텐츠 건수 — 관리자 주제 목록·삭제 판정용(admin.md 4.5).
   * `topics.content_count` 컬럼을 두지 않으므로(domain.md 4.1 — B-7) 여기서 집계한다.
   */
  async countByTopicIds(
    topicIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    if (topicIds.length === 0) {
      return new Map();
    }

    const rows = await this.scoped(manager)
      .createQueryBuilder('content_topic')
      .select('content_topic.topic_id', 'topic_id')
      .addSelect('COUNT(*)', 'count')
      .where('content_topic.topic_id IN (:...topicIds)', { topicIds })
      .groupBy('content_topic.topic_id')
      .getRawMany<{ topic_id: string; count: string }>();

    return new Map(rows.map((row) => [row.topic_id, Number(row.count)]));
  }

  async saveAll(
    contentTopics: ContentTopic[],
    manager?: EntityManager,
  ): Promise<ContentTopic[]> {
    return this.scoped(manager).save(contentTopics);
  }

  create(contentTopic: Partial<ContentTopic>): ContentTopic {
    return this.repository.create(contentTopic);
  }
}
