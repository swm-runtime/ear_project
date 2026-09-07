import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { ContentSource } from '../entities/content-source.entity';

@Injectable()
export class ContentSourceRepository {
  constructor(
    @InjectRepository(ContentSource)
    private readonly repository: Repository<ContentSource>,
  ) {}

  private scoped(manager?: EntityManager): Repository<ContentSource> {
    return manager ? manager.getRepository(ContentSource) : this.repository;
  }

  /** 서버가 정한 표시 순서(position)대로 반환한다 — 응답 조립부는 재정렬하지 않는다 */
  async findAllByContentId(
    contentId: string,
    manager?: EntityManager,
  ): Promise<ContentSource[]> {
    return this.scoped(manager).find({
      where: { contentId },
      order: { position: 'ASC' },
    });
  }

  /** 재발행의 출처 교체(admin-api.md 4.10) — `position`이 1부터 다시 매겨진다 */
  async deleteAllByContentId(
    contentId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).delete({ contentId });
  }

  async saveAll(
    sources: ContentSource[],
    manager?: EntityManager,
  ): Promise<ContentSource[]> {
    return this.scoped(manager).save(sources);
  }

  create(source: Partial<ContentSource>): ContentSource {
    return this.repository.create(source);
  }
}
