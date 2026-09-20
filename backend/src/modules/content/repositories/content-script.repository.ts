import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { ScriptSegment } from '../content.types';
import { ContentScript } from '../entities/content-script.entity';

@Injectable()
export class ContentScriptRepository {
  constructor(
    @InjectRepository(ContentScript)
    private readonly repository: Repository<ContentScript>,
  ) {}

  private scoped(manager?: EntityManager): Repository<ContentScript> {
    return manager ? manager.getRepository(ContentScript) : this.repository;
  }

  async findByContentId(
    contentId: string,
    manager?: EntityManager,
  ): Promise<ContentScript | null> {
    return this.scoped(manager).findOne({ where: { contentId } });
  }

  /** 스크립트가 있는 콘텐츠 id만 — 발급 응답의 `has_script`·관리자 목록용. 본문은 읽지 않는다 */
  async findContentIdsWithScript(
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<string[]> {
    if (contentIds.length === 0) {
      return [];
    }

    const rows = await this.scoped(manager).find({
      select: { contentId: true },
      where: { contentId: In(contentIds) },
    });

    return rows.map((row) => row.contentId);
  }

  /** 콘텐츠당 1행 — 있으면 통째로 바꾼다(재발행의 스크립트 교체). `(content_id)` 유니크가 중복을 막는다 */
  async upsert(
    contentId: string,
    segments: ScriptSegment[],
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).upsert(
      { contentId, segments },
      { conflictPaths: ['contentId'] },
    );
  }

  async deleteByContentId(
    contentId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).delete({ contentId });
  }
}
