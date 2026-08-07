import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { toServiceDate } from '@/common/utils/service-date.util';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { UserService } from '@/modules/user/services/user.service';

import { PlaybackProgressRepository } from '../repositories/playback-progress.repository';
import { PlayRecordRepository } from '../repositories/play-record.repository';
import { UserSignalRepository } from '../repositories/user-signal.repository';
import { UserSignalAction } from '../playback.enum';
import {
  DailyPlayQuota,
  ProgressView,
  UserSignalView,
} from '../playback.types';

/**
 * `playback_progresses` · `play_records` · `user_signals`는 playback 모듈 소유다
 * (domain.md 2장). 다른 모듈은 Repository를 직접 주입받지 않고 이 Service만 호출한다
 * (architecture.md 4.3).
 *
 * `user` · `subscription` Service를 함께 쓰는 것은 **잔여 재생 표시값의 조립**(`buildQuotaForUser`)
 * 때문이다. 두 모듈은 이미 이 모듈의 의존 대상이며(architecture.md 4.5), 어느 쪽도
 * `playback`을 모르므로 순환이 생기지 않는다.
 */
@Injectable()
export class PlaybackService {
  constructor(
    private readonly playbackProgressRepository: PlaybackProgressRepository,
    private readonly playRecordRepository: PlayRecordRepository,
    private readonly userSignalRepository: UserSignalRepository,
    private readonly userService: UserService,
    private readonly planService: PlanService,
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

  /**
   * 최근 소비 신호. 탐색 추천 랭킹의 입력이다(FR-15).
   *
   * **가중치와 해석은 여기서 하지 않는다.** 신호의 의미(완청은 강한 긍정, 스킵은 부정 …)는
   * `drip-scheduling.md` 4.3이 정하고 그것을 쓰는 화면이 적용한다 — 이 모듈은 자기 이력을
   * 돌려줄 뿐이다.
   */
  async findRecentSignals(
    userId: string,
    since: Date,
    limit: number,
    manager?: EntityManager,
  ): Promise<UserSignalView[]> {
    const signals = await this.userSignalRepository.findAllRecentByUserId(
      userId,
      since,
      limit,
      manager,
    );

    return signals.map((signal) => ({
      contentId: signal.contentId,
      action: signal.action,
      createdAt: signal.createdAt,
    }));
  }

  /**
   * 콜드스타트 판정용(FR-17) — `drip-scheduling.md` 4.4의 기준은 **완청 3건**이다.
   *
   * `user_preference_vectors.signal_count`를 읽지 않는 이유: 그 값은 편성 배치가 채우는
   * 파생 캐시인데(domain.md 7.2) 배치가 아직 없어 전부 비어 있고, 탐색 랭킹은 **조회 시점에
   * 즉시** 반영돼야 한다(FR-05). 원천을 직접 세면 캐시 유무와 무관하게 같은 답이 나온다.
   */
  async countSignals(
    userId: string,
    action: UserSignalAction,
    manager?: EntityManager,
  ): Promise<number> {
    return this.userSignalRepository.countByUserIdAndAction(
      userId,
      action,
      manager,
    );
  }

  /**
   * 사용자 티어에서 잔여 재생 표시값까지 한 번에 조립한다.
   *
   * **화면마다 다시 조립하지 않게 하려고 이 한 곳에 둔다**(`explore-api.md` 2장 — 라이브러리와
   * 같은 값을 같은 이름으로 싣고 같은 조립 경로를 쓴다). 두 화면이 각자 계산하면 같은
   * 사용자에게 서로 다른 숫자가 표시되고, 어느 쪽이 맞는지 사용자가 판단하게 된다.
   *
   * 한도 판정(`paywall.md` 4.1)이 필요한 재생 시작은 이 메서드를 쓰지 않는다 — 거기서는
   * `isTopTier`까지 있는 정책 자체가 필요하다.
   */
  async buildQuotaForUser(
    userId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<DailyPlayQuota> {
    const user = await this.userService.getById(userId, manager);
    const policy = await this.planService.getPlayLimitPolicy(
      user.tier,
      manager,
    );

    return this.buildQuota(userId, policy.dailyPlayLimit, now, manager);
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
