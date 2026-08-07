import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { BusinessForbiddenException } from '@/common/exceptions/business-forbidden.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentService } from '@/modules/content/services/content.service';
import { DripExclusionReason } from '@/modules/drip/drip.enum';
import { DripExclusionService } from '@/modules/drip/services/drip-exclusion.service';
import { LibraryService } from '@/modules/library/library.service';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { PlayLimitPolicy } from '@/modules/subscription/subscription.types';
import { UserService } from '@/modules/user/services/user.service';

import { PlayDecision, UserSignalAction } from '../playback.enum';
import { StartPlayCommand, StartPlayResult } from '../playback.types';
import { PlaybackService } from './playback.service';

/**
 * 재생 시작(library-api.md 4.4) — **한도 판정과 카운트 적재가 여기서 일어난다.**
 *
 * 라이브러리·탐색·미니플레이어·푸시가 **같은 경로를 쓴다.** 진입점마다 경로를 나누면
 * 한도가 경로별로 새는 구멍이 된다(`paywall.md` 4.2).
 *
 * 판정 규칙 자체는 이 코드가 소유하지 않는다 — `ALLOW` / `BLOCKED` / `LIMIT_REACHED`의
 * 기준과 차감 단위, 04시 경계는 전부 `paywall.md` 4.1~4.4가 정한다.
 *
 * Orchestrator가 아니라 Service인 이유: 자기 Entity(`play_records` · `user_signals`)를
 * 쓰는 단일 트랜잭션 유스케이스다(architecture.md 3.3 — Orchestrator는 자기 Repository를
 * 갖지 않는다). 다른 도메인 Service를 호출하는 것은 Service의 책임 범위다(3.2).
 */
@Injectable()
export class PlayService {
  private readonly logger = new Logger(PlayService.name);

  constructor(
    private readonly playbackService: PlaybackService,
    private readonly contentService: ContentService,
    private readonly userService: UserService,
    private readonly planService: PlanService,
    private readonly libraryService: LibraryService,
    private readonly dripExclusionService: DripExclusionService,
    private readonly dataSource: DataSource,
  ) {}

  /** 서버 처리 6단계를 **하나의 트랜잭션**으로 수행한다(architecture.md 8.1) */
  async startPlay(command: StartPlayCommand): Promise<StartPlayResult> {
    return this.dataSource.transaction(async (manager) => {
      // 1. 회수 여부는 목록에서 걸러도 이미 화면에 떠 있는 항목이 탭될 수 있다
      await this.contentService.getPublishedById(command.contentId, manager);

      const user = await this.userService.getById(command.userId, manager);
      const policy = await this.planService.getPlayLimitPolicy(
        user.tier,
        manager,
      );

      // 2. 한도 판정 — 클라이언트가 보낸 잔여 횟수·티어·진입점은 쓰지 않는다
      await this.assertPlayable(command, policy, manager);

      // 3. 유니크 제약이 하루 단위 중복을 막는다(domain.md 6.3)
      const counted = await this.playbackService.recordPlay(
        command.userId,
        command.contentId,
        command.now,
        manager,
      );

      // 4. 라이브러리에 있으면 상태를 전이한다. 없으면 행을 만들지 않는다
      const libraryItem = await this.libraryService.markPlayStarted(
        command.userId,
        command.contentId,
        command.now,
        manager,
      );

      // 5. 들은 콘텐츠는 드립으로 다시 오지 않는다(FR-16). 최초 사유는 유지된다
      await this.dripExclusionService.exclude(
        command.userId,
        command.contentId,
        DripExclusionReason.PLAYED,
        command.now,
        manager,
      );

      // 6. 편성·추천 갱신의 입력(FR-15)
      await this.playbackService.recordSignal(
        command.userId,
        command.contentId,
        UserSignalAction.PLAY,
        manager,
      );

      const [progress, quota] = await Promise.all([
        this.playbackService.findProgress(
          command.userId,
          command.contentId,
          manager,
        ),
        // 적재 **이후의** 값을 내려준다 — 클라이언트는 이 값으로 표시를 덮어쓴다
        this.playbackService.buildQuota(
          command.userId,
          policy.dailyPlayLimit,
          command.now,
          manager,
        ),
      ]);

      this.logger.log('play started', {
        userId: command.userId,
        contentId: command.contentId,
        entryPoint: command.entryPoint,
        counted,
      });

      return {
        counted,
        libraryItem: libraryItem
          ? {
              id: libraryItem.id,
              status: libraryItem.status,
              lastPlayedAt: libraryItem.lastPlayedAt,
            }
          : null,
        progress,
        quota,
      };
    });
  }

  /**
   * `paywall.md` 4.1의 판정.
   *
   * ```
   * limit == null                 → ALLOW (무제한)
   * 오늘 이미 카운트된 콘텐츠        → ALLOW (차감이 없으므로 한도와 무관)
   * count < limit                 → ALLOW
   * 최상위 티어                     → LIMIT_REACHED (한도 안내만, 페이월 없음)
   * 그 외 한도 티어(무료 포함)       → BLOCKED (페이월)
   * ```
   *
   * **이미 카운트된 콘텐츠를 한도로 막지 않는다.** 한도를 소진한 상태여도 오늘 이미 튼
   * 콘텐츠의 이어듣기는 허용된다(`paywall.md` 7) — 카운트 단위가 "재생 횟수"가 아니라
   * "오늘 재생한 고유 콘텐츠 수"이므로 차감이 발생하지 않기 때문이다. 이걸 막으면
   * 이어듣기·되감기가 한도에 걸려 정상 사용이 불가능해진다.
   */
  private async assertPlayable(
    command: StartPlayCommand,
    policy: PlayLimitPolicy,
    manager: EntityManager,
  ): Promise<void> {
    if (policy.dailyPlayLimit === null) {
      return;
    }

    const isCountedToday = await this.playbackService.isCountedToday(
      command.userId,
      command.contentId,
      command.now,
      manager,
    );

    if (isCountedToday) {
      return;
    }

    const dailyPlayCount = await this.playbackService.countPlays(
      command.userId,
      command.now,
      manager,
    );

    if (dailyPlayCount < policy.dailyPlayLimit) {
      return;
    }

    const decision = policy.isTopTier
      ? PlayDecision.LIMIT_REACHED
      : PlayDecision.BLOCKED;

    // 페이월 노출은 서비스가 의도한 정상 분기이므로 info다 (convention.md 8.2)
    this.logger.log('play blocked by daily limit', {
      userId: command.userId,
      contentId: command.contentId,
      entryPoint: command.entryPoint,
      dailyPlayCount,
      dailyPlayLimit: policy.dailyPlayLimit,
      decision,
    });

    // **두 한도 에러를 하나로 합치지 않는다** — 무료는 페이월(결제 유도), 최상위는 안내다
    throw decision === PlayDecision.LIMIT_REACHED
      ? new BusinessForbiddenException({
          errorCode: ErrorCode.PLAY_LIMIT_REACHED,
          message: '오늘 청취 한도를 모두 사용했어요',
          logLevel: 'info',
        })
      : new BusinessForbiddenException({
          errorCode: ErrorCode.PLAY_LIMIT_EXCEEDED,
          message: '오늘 들을 수 있는 콘텐츠를 모두 들었어요',
          logLevel: 'info',
        });
  }
}
