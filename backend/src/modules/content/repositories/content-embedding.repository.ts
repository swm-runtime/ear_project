import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

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

  /**
   * 스코어링에 쓸 수 있는 행만 — 지정 모델이고(`model` 혼용 금지 — domain.md 5.6)
   * 현재 대본 버전과 일치하는 것(재발행 후 미갱신 행은 축 제외 — `drip-scheduling.md` 6장).
   */
  async findAllScorableByContentIds(
    contentIds: string[],
    model: string,
    manager?: EntityManager,
  ): Promise<ContentEmbedding[]> {
    if (contentIds.length === 0) {
      return [];
    }

    return this.scoped(manager)
      .createQueryBuilder('embedding')
      .innerJoin(
        'embedding.content',
        'content',
        'content.content_version = embedding.content_version',
      )
      .where('embedding.content_id IN (:...contentIds)', { contentIds })
      .andWhere('embedding.model = :model', { model })
      .getMany();
  }

  /**
   * 대본이 그대로인 재발행의 버전 승계 — 직전 버전과 일치하던 행만 새 버전으로 올린다.
   * 이미 낡은 행(그 전 재발행에서 미갱신)은 건드리지 않는다 — 어느 대본 기준인지 모르게 된다.
   */
  async carryVersionForward(
    contentId: string,
    fromVersion: number,
    toVersion: number,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager)
      .createQueryBuilder()
      .update(ContentEmbedding)
      .set({ contentVersion: toVersion })
      .where('content_id = :contentId', { contentId })
      .andWhere('content_version = :fromVersion', { fromVersion })
      .execute();
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
