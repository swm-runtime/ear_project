import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import {
  shiftServiceDate,
  toServiceDate,
} from '@/common/utils/service-date.util';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { UserService } from '@/modules/user/services/user.service';

import { PlaybackProgressRepository } from '../repositories/playback-progress.repository';
import { PlayRecordRepository } from '../repositories/play-record.repository';
import { UserSignalRepository } from '../repositories/user-signal.repository';
import { REPLAY_WINDOW_DAYS } from '../playback.constant';
import { UserSignalAction } from '../playback.enum';
import {
  ContentListenedSecView,
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

  /**
   * 목록의 `is_counted_today` — **재청취 창 안이라 지금 틀어도 차감이 없는** `content_id`
   * 집합(`library-api.md` 4.1, 개정 2026-08-10 — 필드명은 유지하고 의미를 "오늘 카운트됨"
   * 에서 "창 안"으로 넓혔다).
   *
   * 창 범위 계산은 `isWithinReplayWindow`(단건 판정)와 같아야 한다 — 목록의 힌트와 재생
   * 시점의 판정이 다르면 팝업 없이 차감되거나 거짓 차감 고지가 나간다.
   */
  async findCountedContentIds(
    userId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<Set<string>> {
    const fromPlayDate = shiftServiceDate(
      toServiceDate(now),
      -(REPLAY_WINDOW_DAYS - 1),
    );

    const contentIds =
      await this.playRecordRepository.findAllCountedContentIdsSince(
        userId,
        fromPlayDate,
        manager,
      );

    return new Set(contentIds);
  }

  /**
   * 재청취 창 안인가 — **차감 발생일로부터 15일(당일 포함)**(`paywall.md` 4.3-1).
   *
   * 창 안이면 차감도 차단도 없다. 한도 검사보다 **먼저** 판정되므로 한도를 소진한 상태에서도
   * 재청취가 허용된다.
   *
   * 시각이 아니라 **서비스 날짜 라벨 위에서** 범위를 계산한다 — `play_date`가 이미 04시
   * 경계로 계산된 값이라(domain.md 1.2) 시각으로 다시 자르면 경계가 두 번 적용된다.
   */
  async isWithinReplayWindow(
    userId: string,
    contentId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<boolean> {
    // 당일을 포함해 15일이므로 하루를 뺀 만큼만 거슬러 올라간다
    const fromPlayDate = shiftServiceDate(
      toServiceDate(now),
      -(REPLAY_WINDOW_DAYS - 1),
    );

    return this.playRecordRepository.existsCountedSince(
      userId,
      contentId,
      fromPlayDate,
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
   * 누적 청취 시간(초) — 프로필 통계의 `total_listened_sec`(`profile-api.md` 4.1).
   * `play_records`는 이 모듈 소유이므로 집계도 여기를 거친다(architecture.md 4.3).
   */
  async sumListenedSec(
    userId: string,
    manager?: EntityManager,
  ): Promise<number> {
    return this.playRecordRepository.sumListenedSecByUserId(userId, manager);
  }

  /**
   * 재생 기록이 있는 서비스 날짜(최신순, 중복 제거) — 연속 청취 일수 판정의 입력.
   *
   * 판정 자체를 여기서 하지 않는 이유는 규칙의 소유자가 프로필 화면이기 때문이다
   * (`profile.md` 4.5). 이 모듈은 원천만 내어 준다.
   */
  async findPlayDates(
    userId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    return this.playRecordRepository.findAllPlayDatesByUserId(userId, manager);
  }

  /** 지정한 서비스 날짜들의 청취 시간 합 — 주간 그래프(`profile.md` 4.6) */
  async sumListenedSecByDates(
    userId: string,
    playDates: string[],
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    return this.playRecordRepository.sumListenedSecByPlayDates(
      userId,
      playDates,
      manager,
    );
  }

  /** 콘텐츠별 누적 청취 시간 — 주제 분포의 원천(`profile.md` 4.7) */
  async sumListenedSecByContent(
    userId: string,
    manager?: EntityManager,
  ): Promise<ContentListenedSecView[]> {
    return this.playRecordRepository.sumListenedSecGroupByContentId(
      userId,
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
   * **창 안의 재청취도 행을 만든다**(`isCounted = false`). 차감은 없지만 `listened_sec`
   * 적산 대상이 필요하기 때문이다(domain.md 6.3).
   *
   * @returns 이 요청으로 행이 새로 생겼는지
   */
  async recordPlay(
    userId: string,
    contentId: string,
    isCounted: boolean,
    now: Date,
    manager?: EntityManager,
  ): Promise<boolean> {
    return this.playRecordRepository.insertIgnoringConflicts(
      {
        userId,
        contentId,
        playDate: toServiceDate(now),
        playedAt: now,
        isCounted,
      },
      manager,
    );
  }

  /**
   * `listened_sec` 적산(`player.md` 4.4-1) — 그 (user, content)의 **가장 최근 행**에 더한다.
   *
   * 행이 없으면 아무것도 하지 않는다. 정상 흐름에서는 재생 시작이 행을 먼저 만들지만,
   * 오프라인 큐가 순서를 어겨 위치 저장이 먼저 도착할 수 있다(`player-api.md` 4.3) —
   * 그때 행을 만들면 **재생하지 않은 날짜에 차감 없는 행이 생긴다.**
   *
   * @returns 실제로 적산했는지
   */
  async addListenedSec(
    userId: string,
    contentId: string,
    delta: number,
    manager?: EntityManager,
  ): Promise<boolean> {
    if (delta <= 0) {
      return false;
    }

    const record =
      await this.playRecordRepository.findLatestByUserIdAndContentId(
        userId,
        contentId,
        manager,
      );

    if (!record) {
      return false;
    }

    await this.playRecordRepository.incrementListenedSec(
      record.id,
      delta,
      manager,
    );

    return true;
  }

  /**
   * 위치 저장(`player-api.md` 4.3). user × content 당 1행이다.
   *
   * 반환값은 입력값 그대로다 — LWW에 서버 보정이 없어(domain.md 6.2) 저장 결과와 입력이
   * 항상 같고, 재조회는 최다 빈도 쓰기 경로의 왕복만 더한다.
   */
  async saveProgress(
    userId: string,
    contentId: string,
    positionSec: number,
    maxReachedSec: number,
    manager?: EntityManager,
  ): Promise<ProgressView> {
    await this.playbackProgressRepository.upsert(
      userId,
      contentId,
      positionSec,
      maxReachedSec,
      manager,
    );

    return { contentId, positionSec, maxReachedSec };
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
