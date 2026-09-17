import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { ContentTopicView } from '../content.types';
import {
  CONTENT_VISIBILITY_CONDITION,
  contentVisibilityParameters,
} from '../content.visibility';
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

  /**
   * 주제별 **노출 가능한** 콘텐츠 건수 — 주제 노출 판정용(admin.md 4.5, KAN-58).
   *
   * 위 `countByTopicIds`와 목적이 다르다. 그쪽은 **연결 행 전체**를 세며 주제 삭제 판정에 쓴다 —
   * 회수·만료된 콘텐츠도 `content_topics` 행이 남아 FK가 걸리기 때문이다. 이쪽은 **앱에 실제로
   * 보이는 콘텐츠만** 센다: 회수·파일 삭제를 해도 콘텐츠 행은 남으므로, 연결 행으로 세면 "콘텐츠를
   * 다 내렸는데도 0건이 아닌" 주제가 노출된 채 남는다.
   *
   * 조건은 `CONTENT_VISIBILITY_CONDITION`을 그대로 쓴다(domain.md 5.1). 여기서 따로 적으면 탐색이
   * 보여주는 콘텐츠와 이 건수가 다른 기준을 갖게 된다. 0건인 주제는 결과 Map에 없다.
   */
  async countVisibleByTopicIds(
    topicIds: string[],
    now: Date,
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    if (topicIds.length === 0) {
      return new Map();
    }

    const rows = await this.scoped(manager)
      .createQueryBuilder('content_topic')
      .innerJoin('contents', 'content', 'content.id = content_topic.content_id')
      .select('content_topic.topic_id', 'topic_id')
      .addSelect('COUNT(*)', 'count')
      .where('content_topic.topic_id IN (:...topicIds)', { topicIds })
      .andWhere(CONTENT_VISIBILITY_CONDITION, contentVisibilityParameters(now))
      .groupBy('content_topic.topic_id')
      .getRawMany<{ topic_id: string; count: string }>();

    return new Map(rows.map((row) => [row.topic_id, Number(row.count)]));
  }

  /** 재발행의 주제 교체(admin-api.md 4.10) — 부분 갱신이 아니라 지우고 다시 넣는다 */
  async deleteAllByContentId(
    contentId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).delete({ contentId });
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
