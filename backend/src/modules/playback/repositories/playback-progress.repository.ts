import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { PlaybackProgress } from '../entities/playback-progress.entity';

@Injectable()
export class PlaybackProgressRepository {
  constructor(
    @InjectRepository(PlaybackProgress)
    private readonly repository: Repository<PlaybackProgress>,
  ) {}

  private scoped(manager?: EntityManager): Repository<PlaybackProgress> {
    return manager ? manager.getRepository(PlaybackProgress) : this.repository;
  }

  async findByUserIdAndContentId(
    userId: string,
    contentId: string,
    manager?: EntityManager,
  ): Promise<PlaybackProgress | null> {
    return this.scoped(manager).findOneBy({ userId, contentId });
  }

  /**
   * 목록 20건에 위치 조회가 20번 붙지 않게 한 번에 읽는다
   * (architecture.md 3.4 — Service에서 루프 조회하지 않는다).
   */
  async findAllByUserIdAndContentIds(
    userId: string,
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<PlaybackProgress[]> {
    if (contentIds.length === 0) {
      return [];
    }

    return this.scoped(manager).findBy({
      userId,
      contentId: In(contentIds),
    });
  }

  /**
   * 미니플레이어 복원 후보(library-api.md 4.3) — **위치가 0보다 큰 콘텐츠만.**
   * 위치가 0이면 처음부터 듣는 것과 같아 이어들 자리가 없다.
   */
  async findAllStartedContentIdsByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('progress')
      .select('progress.content_id', 'content_id')
      .where('progress.user_id = :userId', { userId })
      .andWhere('progress.position_sec > 0')
      .getRawMany<{ content_id: string }>();

    return rows.map((row) => row.content_id);
  }
}
