import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { ContentAudioRendition } from '../entities/content-audio-rendition.entity';

@Injectable()
export class ContentAudioRenditionRepository {
  constructor(
    @InjectRepository(ContentAudioRendition)
    private readonly repository: Repository<ContentAudioRendition>,
  ) {}

  private scoped(manager?: EntityManager): Repository<ContentAudioRendition> {
    return manager
      ? manager.getRepository(ContentAudioRendition)
      : this.repository;
  }

  async findByContentId(
    contentId: string,
    manager?: EntityManager,
  ): Promise<ContentAudioRendition[]> {
    return this.scoped(manager).find({ where: { contentId } });
  }

  async findByContentIds(
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<ContentAudioRendition[]> {
    if (contentIds.length === 0) return [];
    return this.scoped(manager).find({ where: { contentId: In(contentIds) } });
  }

  /** 콘텐츠의 음질 행을 **통째로** 바꾼다 — 재발행은 3종을 한 세트로 본다(domain.md 5.1-1) */
  async replaceAll(
    contentId: string,
    rows: Omit<
      ContentAudioRendition,
      'id' | 'content' | 'createdAt' | 'updatedAt'
    >[],
    manager: EntityManager,
  ): Promise<void> {
    const repository = this.scoped(manager);
    await repository.delete({ contentId });
    if (rows.length > 0) {
      await repository.insert(rows);
    }
  }
}
