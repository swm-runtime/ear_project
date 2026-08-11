import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { SourceLinkClick } from '../entities/source-link-click.entity';

@Injectable()
export class SourceLinkClickRepository {
  constructor(
    @InjectRepository(SourceLinkClick)
    private readonly repository: Repository<SourceLinkClick>,
  ) {}

  private scoped(manager?: EntityManager): Repository<SourceLinkClick> {
    return manager ? manager.getRepository(SourceLinkClick) : this.repository;
  }

  /**
   * **클릭 1회 = 1행이다**(domain.md 6.6). 같은 사용자가 여러 번 탭하면 그 수만큼 행이
   * 생긴다 — 중복이 아니라 각 클릭이 사건이다. 중복 흡수는 `Idempotency-Key`의 몫이며
   * (`player-api.md` 4.5) 이 계층에는 유니크 제약이 없다.
   */
  async insert(
    userId: string,
    contentId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).insert({ userId, contentId });
  }
}
