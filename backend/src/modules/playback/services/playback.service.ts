import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { toServiceDate } from '@/common/utils/service-date.util';

import { PlaybackProgressRepository } from '../repositories/playback-progress.repository';
import { PlayRecordRepository } from '../repositories/play-record.repository';
import { UserSignalRepository } from '../repositories/user-signal.repository';
import { UserSignalAction } from '../playback.enum';
import { DailyPlayQuota, ProgressView } from '../playback.types';

/**
 * `playback_progresses` · `play_records` · `user_signals`는 playback 모듈 소유다
 * (domain.md 2장). 다른 모듈은 Repository를 직접 주입받지 않고 이 Service만 호출한다
 * (architecture.md 4.3).
 */
@Injectable()
export class PlaybackService {
  constructor(
    private readonly playbackProgressRepository: PlaybackProgressRepository,
    private readonly playRecordRepository: PlayRecordRepository,
    private readonly userSignalRepository: UserSignalRepository,
  ) {}

  async findProgress(
    userId: string,
    contentId: string,
    manager?: EntityManager,
  ): Promise<ProgressView | null> {
    const progress =
      await this.playbackProgressRepository.findByUserIdAndContentId(
        userId,
        contentId,
        manager,
      );

    return progress ? toProgressView(progress) : null;
  }

  async findProgresses(
    userId: string,
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<ProgressView[]> {
    const progresses =
      await this.playbackProgressRepository.findAllByUserIdAndContentIds(
        userId,
        contentIds,
        manager,
      );

    return progresses.map(toProgressView);
  }

  /** 미니플레이어 복원 후보 — 재생 위치가 0보다 큰 콘텐츠(library-api.md 4.3) */
  async findStartedContentIds(
    userId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    return this.playbackProgressRepository.findAllStartedContentIdsByUserId(
      userId,
      manager,
    );
  }

  /** 오늘의 서비스 날짜에 이미 카운트된 `content_id` 집합 — 목록의 `is_counted_today` */
  async findCountedContentIds(
    userId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<Set<string>> {
    const contentIds = await this.playRecordRepository.findAllCountedContentIds(
      userId,
      toServiceDate(now),
      manager,
    );

    return new Set(contentIds);
  }

  /**
   * 이 콘텐츠가 오늘의 서비스 날짜에 이미 카운트됐는가.
   * **차감 여부 판정의 근거이지 표시값이 아니다** — 이 값이 참이면 재생해도 차감이 없다.
   */
  async isCountedToday(
    userId: string,
    contentId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<boolean> {
    return this.playRecordRepository.existsByUserIdAndContentIdAndPlayDate(
      userId,
      contentId,
      toServiceDate(now),
      manager,
    );
  }

  async countPlays(
    userId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<number> {
    return this.playRecordRepository.countByUserIdAndPlayDate(
      userId,
      toServiceDate(now),
      manager,
    );
  }

  /**
   * 잔여 재생 표시값을 만든다(library-api.md 2장). 목록·복원·재생 시작이 **같은 규칙으로**
   * 만들도록 이 한 곳에 둔다 — 화면마다 다른 숫자가 나가면 어느 쪽이 맞는지 사용자가
   * 판단하게 된다.
   *
   * **`dailyPlayLimit`이 null이면 `dailyPlayCount`도 null이다.** 무제한 티어에 0을 내려주면
   * 화면이 "무제한인데 0회 쓴 것"으로 읽고 카운터를 그릴 근거가 생긴다.
   */
  async buildQuota(
    userId: string,
    dailyPlayLimit: number | null,
    now: Date,
    manager?: EntityManager,
  ): Promise<DailyPlayQuota> {
    const serviceDate = toServiceDate(now);

    if (dailyPlayLimit === null) {
      return { dailyPlayLimit: null, dailyPlayCount: null, serviceDate };
    }

    const dailyPlayCount =
      await this.playRecordRepository.countByUserIdAndPlayDate(
        userId,
        serviceDate,
        manager,
      );

    return { dailyPlayLimit, dailyPlayCount, serviceDate };
  }

  /**
   * 재생 카운트를 적재한다. 유니크 제약이 하루 단위 멱등을 보장하므로
   * **같은 날 같은 콘텐츠를 두 번 눌러도 행이 늘지 않는다**(`paywall.md` 4.3).
   *
   * @returns 이 요청으로 행이 새로 생겼는지 = 차감이 실제로 일어났는지
   */
  async recordPlay(
    userId: string,
    contentId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<boolean> {
    return this.playRecordRepository.insertIgnoringConflicts(
      {
        userId,
        contentId,
        playDate: toServiceDate(now),
        playedAt: now,
      },
      manager,
    );
  }

  async recordSignal(
    userId: string,
    contentId: string,
    action: UserSignalAction,
    manager?: EntityManager,
  ): Promise<void> {
    await this.userSignalRepository.insert(
      { userId, contentId, action },
      manager,
    );
  }
}

function toProgressView(progress: {
  contentId: string;
  positionSec: number;
  maxReachedSec: number;
}): ProgressView {
  return {
    contentId: progress.contentId,
    positionSec: progress.positionSec,
    maxReachedSec: progress.maxReachedSec,
  };
}
