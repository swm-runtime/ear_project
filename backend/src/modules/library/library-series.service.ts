import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import {
  LibrarySeriesRepository,
  NewEpisodeDelivery,
} from './library-series.repository';

/**
 * 시리즈째 담기(`library_series`, domain.md 6.1-1 — KAN-245). 다른 모듈은 이 Service만 호출한다(architecture.md 4.3).
 *
 * **편 단위 적립·삭제·복구는 여기서 하지 않는다** — 시리즈 담기·빼기·복구의 편 처리는 기존 편 규칙(`LibraryService.save` ·
 * 삭제 · 복구)을 그대로 부르는 Orchestrator(`series-detail`)의 몫이다. 이 Service는 "시리즈째 담았다"는 기록과, 그 기록을
 * 근거로 한 새 편 적립 한 문장만 맡는다.
 */
@Injectable()
export class LibrarySeriesService {
  constructor(
    private readonly librarySeriesRepository: LibrarySeriesRepository,
  ) {}

  /** 시리즈째 담기 — 삭제분이면 되살리고 `added_at`을 새로, 살아 있으면 그대로(멱등) */
  async follow(
    userId: string,
    seriesId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<void> {
    await this.librarySeriesRepository.upsertActive(
      userId,
      seriesId,
      now,
      manager,
    );
  }

  /** 시리즈째 빼기 — 새 편이 더 따라오지 않는다. 담은 적 없어도 실패하지 않는다(오프라인 큐 재전송) */
  async unfollow(
    userId: string,
    seriesId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<boolean> {
    return this.librarySeriesRepository.softDelete(
      userId,
      seriesId,
      now,
      manager,
    );
  }

  /** 빼기 실행 취소 — `added_at` 유지. 뺀 적 없는(살아 있거나 아예 없는) 경우는 아무것도 하지 않는다 */
  async restoreFollow(
    userId: string,
    seriesId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    return this.librarySeriesRepository.restore(userId, seriesId, manager);
  }

  /** `GET /series/:id`의 `series.is_saved` — 살아 있는 시리즈째 담기 행이 있는가 */
  async isFollowing(
    userId: string,
    seriesId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    return this.librarySeriesRepository.existsActive(userId, seriesId, manager);
  }

  /**
   * 새 편 적립(KAN-245 무엇을 한다 6) — 시리즈 편이 **처음 공개된 직후** 발행 경로가 부른다. 조건은
   * `DELIVER_NEW_EPISODE_SQL` 주석. 신호(`user_signals`)를 남기지 않는다 — 사용자의 그 편 담기 조작이 아니다
   * (탐색 재생 자동 적립 `auto_play`와 같은 이유).
   *
   * @returns 새 편을 받은 사용자 수
   */
  async deliverNewEpisode(
    delivery: NewEpisodeDelivery,
    manager?: EntityManager,
  ): Promise<number> {
    const userIds = await this.librarySeriesRepository.deliverNewEpisode(
      delivery,
      manager,
    );

    return userIds.length;
  }
}
