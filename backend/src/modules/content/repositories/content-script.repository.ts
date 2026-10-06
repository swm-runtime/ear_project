import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { ScriptDocument, ScriptSection } from '../content.types';
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

  /**
   * 발급 응답용(`player-api.md` 4.1 `has_script`·`sections`) — 구간만 읽는다. 세그먼트 본문(수십 KB)은
   * 4.7이 따로 내준다. 행이 없으면 `null`(= 대본 없음)
   */
  async findSectionsByContentId(
    contentId: string,
    manager?: EntityManager,
  ): Promise<ScriptSection[] | null> {
    const row = await this.scoped(manager).findOne({
      select: { id: true, sections: true },
      where: { contentId },
    });

    return row?.sections ?? null;
  }

  /** 콘텐츠당 1행 — 있으면 통째로 바꾼다(재발행의 스크립트 교체). `(content_id)` 유니크가 중복을 막는다 */
  async upsert(
    contentId: string,
    script: ScriptDocument,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).upsert(
      { contentId, segments: script.segments, sections: script.sections },
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
