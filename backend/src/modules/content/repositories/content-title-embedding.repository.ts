import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { ContentTitleEmbedding } from '../entities/content-title-embedding.entity';
import { Content } from '../entities/content.entity';

@Injectable()
export class ContentTitleEmbeddingRepository {
  constructor(
    @InjectRepository(ContentTitleEmbedding)
    private readonly repository: Repository<ContentTitleEmbedding>,
  ) {}

  private scoped(manager?: EntityManager): Repository<ContentTitleEmbedding> {
    return manager
      ? manager.getRepository(ContentTitleEmbedding)
      : this.repository;
  }

  async findByContentId(
    contentId: string,
    manager?: EntityManager,
  ): Promise<ContentTitleEmbedding | null> {
    return this.scoped(manager).findOneBy({ contentId });
  }

  /**
   * 유효한 제목 임베딩이 **없는** 콘텐츠 — 행이 없거나, 모델이 다르거나, 임베딩한 글자(`source_text`)가 지금 제목과 다르다.
   * 백필의 대상이고, 한 번 채운 편은 다음 실행에서 빠진다(멱등). 상태는 가리지 않는다 — 회수 편도 복구되면 다시 검색에 나온다.
   * 최근 발행 순이라 상한(`limit`)으로 끊어 돌려도 새 편부터 채워진다.
   */
  async findContentsMissingTitleEmbedding(
    model: string,
    options: { contentIds?: string[]; limit?: number } = {},
    manager?: EntityManager,
  ): Promise<{ id: string; title: string }[]> {
    const query = this.scoped(manager)
      .manager.createQueryBuilder(Content, 'content')
      .select('content.id', 'id')
      .addSelect('content.title', 'title')
      .leftJoin(
        ContentTitleEmbedding,
        'title_embedding',
        'title_embedding.content_id = content.id',
      )
      .where(
        `(title_embedding.id IS NULL
          OR title_embedding.model <> :model
          OR title_embedding.source_text <> content.title)`,
        { model },
      )
      .orderBy('content.published_at', 'DESC')
      .addOrderBy('content.id', 'DESC');

    if (options.contentIds) {
      if (options.contentIds.length === 0) {
        return [];
      }
      query.andWhere('content.id IN (:...contentIds)', {
        contentIds: options.contentIds,
      });
    }

    if (options.limit !== undefined) {
      query.limit(options.limit);
    }

    return query.getRawMany<{ id: string; title: string }>();
  }

  /** 콘텐츠당 1행(`uq_content_title_embeddings_content_id`)의 전체 교체 upsert — 생성·재생성이 같은 경로다 */
  async upsert(
    embedding: Pick<
      ContentTitleEmbedding,
      'contentId' | 'embedding' | 'model' | 'sourceText'
    >,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      .values(embedding)
      .orUpdate(
        ['embedding', 'model', 'source_text', 'updated_at'],
        'uq_content_title_embeddings_content_id',
      )
      .execute();
  }
}
