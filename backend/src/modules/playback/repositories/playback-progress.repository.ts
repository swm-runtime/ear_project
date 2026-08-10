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
   * 위치 저장(`player-api.md` 4.3). user × content 당 1행이므로 upsert다(domain.md 6.2).
   *
   * `INSERT ... ON CONFLICT DO UPDATE`로 한 문장에 처리하는 이유는 조회 후 분기하면 동시
   * 요청 두 개가 모두 "행이 없다"를 보고 각자 INSERT 하기 때문이다.
   * `uq_playback_progresses_user_id_content_id`가 최종 방어이고 `orUpdate`가 그 충돌을
   * 갱신으로 흡수한다(architecture.md 8.4).
   *
   * **저장 후 재조회하지 않는다.** LWW라 서버가 아무 값도 보정하지 않으므로
   * (`max_reached_sec` 단조 증가 보정 없음 — domain.md 6.2, 스키마 소유자가 정한 충돌
   * 규칙) 저장된 값은 정확히 입력값이다. 이 경로는 재생마다 5초 주기로 도는 최다 빈도
   * 쓰기라, 정보를 더하지 않는 왕복 하나가 그대로 부하 두 배가 된다.
   */
  async upsert(
    userId: string,
    contentId: string,
    positionSec: number,
    maxReachedSec: number,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      .into(PlaybackProgress)
      .values({ userId, contentId, positionSec, maxReachedSec })
      .orUpdate(['position_sec', 'max_reached_sec'], ['user_id', 'content_id'])
      .execute();
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
