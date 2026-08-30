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
