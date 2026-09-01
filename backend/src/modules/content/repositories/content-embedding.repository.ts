import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { ContentEmbedding } from '../entities/content-embedding.entity';

@Injectable()
export class ContentEmbeddingRepository {
  constructor(
    @InjectRepository(ContentEmbedding)
    private readonly repository: Repository<ContentEmbedding>,
  ) {}

  private scoped(manager?: EntityManager): Repository<ContentEmbedding> {
    return manager ? manager.getRepository(ContentEmbedding) : this.repository;
  }

  /** 편성 배치의 임베딩 축 입력 — 행이 없는 콘텐츠는 축 제외로 처리된다(`drip-scheduling.md` 4.2) */
  async findAllByContentIds(
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<ContentEmbedding[]> {
    if (contentIds.length === 0) {
      return [];
    }

    return this.scoped(manager).findBy({ contentId: In(contentIds) });
  }

  /**
   * 콘텐츠당 1행(`uq_content_embeddings_content_id`)의 전체 교체 upsert —
   * 재발행·모델 교체의 재생성이 같은 경로를 쓴다(domain.md 5.6).
   */
  async upsert(
    embedding: Partial<ContentEmbedding>,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      .values(embedding)
      .orUpdate(
        ['embedding', 'model', 'content_version', 'updated_at'],
        'uq_content_embeddings_content_id',
      )
      .execute();
  }
}
