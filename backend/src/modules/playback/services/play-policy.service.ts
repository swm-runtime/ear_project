import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BusinessForbiddenException } from '@/common/exceptions/business-forbidden.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { UserService } from '@/modules/user/services/user.service';

import { PlayPermission } from '../playback.types';
import { PlaybackService } from './playback.service';

/**
 * `paywall.md` 4.1의 재생 가능 판정 — **재생 시작과 서명 URL 발급이 이 한 곳을 공유한다.**
 *
 * 두 벌로 두면 발급은 되는데 재생은 막히는(또는 그 반대의) 어긋남이 생긴다
 * (`player-api.md` 3장 설계 메모 — "판정 로직이 두 벌이면 발급은 되는데 재생은 막힌다").
 * 차이는 판정 **이후**에만 있다 — 재생 시작은 차감하고, 발급은 허용·거부만 한다.
 *
 * ```
 * limit == null                 → ALLOW (무제한)
 * 재청취 창 내 (15일, 4.3-1)     → ALLOW (차감 없음 — 한도 소진 상태에서도 허용)
 * count < limit                 → ALLOW (차감 발생)
 * 최상위 티어                     → LIMIT_REACHED (한도 안내만, 페이월 없음)
 * 그 외 한도 티어(무료 포함)       → BLOCKED (페이월)
 * ```
 *
 * **판정 규칙 자체는 이 코드가 소유하지 않는다.** 기준·차감 단위·04시 경계는 전부
 * `paywall.md` 4.1~4.4가 정하고, 티어명을 코드에 하드코딩하지 않는다 — 한도는
 * `plans.daily_play_limit`에서 읽는다.
 */
@Injectable()
export class PlayPolicyService {
  private readonly logger = new Logger(PlayPolicyService.name);

  constructor(
    private readonly playbackService: PlaybackService,
    private readonly userService: UserService,
    private readonly planService: PlanService,
  ) {}

  /**
   * 허용되면 결과를 돌려주고, 아니면 403을 던진다.
   *
   * **클라이언트가 보낸 티어·잔여 횟수·진입점을 판정에 쓰지 않는다**(architecture.md 9.2).
   * 전부 토큰의 `user_id`와 서버 조회로 도출한다.
   */
  async assertPlayable(
    userId: string,
    contentId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<PlayPermission> {
    const user = await this.userService.getById(userId, manager);
    const policy = await this.planService.getPlayLimitPolicy(
      user.tier,
      manager,
    );
    const { dailyPlayLimit } = policy;

    /**
     * 무제한 티어는 **차감이 없지만 창의 기산점은 된다**(결정 2026-08-11 — 유료 티어도
     * 15일 재청취 권리를 똑같이 지급한다). 구독으로 지불된 재생이므로, 나중에 한도 티어로
     * 내려와도 최근 15일 안에 들은 콘텐츠는 차감·차단 없이 이어 들을 수 있다.
     *
     * 창 검사를 하지 않는 이유: 어차피 항상 허용이고, 매 재생이 새 기산점이 되어
     * 그날의 행이 `true`로 적히면 충분하다.
     */
    if (dailyPlayLimit === null) {
      return { deductsQuota: false, opensReplayWindow: true, dailyPlayLimit };
    }

    // 한도 검사보다 **먼저** 본다 — 창 안이면 소진 상태에서도 허용된다(4.3-1)
    const isWithinReplayWindow =
      await this.playbackService.isWithinReplayWindow(
        userId,
        contentId,
        now,
        manager,
      );

    if (isWithinReplayWindow) {
      // 창 안의 재청취는 기산점이 아니다 — 기산점이면 창이 재청취마다 늘어나 닫히지 않는다
      return { deductsQuota: false, opensReplayWindow: false, dailyPlayLimit };
    }

    const dailyPlayCount = await this.playbackService.countPlays(
      userId,
      now,
      manager,
    );

    if (dailyPlayCount < dailyPlayLimit) {
      return { deductsQuota: true, opensReplayWindow: true, dailyPlayLimit };
    }

    // **두 한도 에러를 하나로 합치지 않는다** — 무료는 페이월(결제 유도), 최상위는 안내다
    const errorCode = policy.isTopTier
      ? ErrorCode.PLAY_LIMIT_REACHED
      : ErrorCode.PLAY_LIMIT_EXCEEDED;

    // 페이월 노출은 서비스가 의도한 정상 분기이므로 info다(convention.md 8.2).
    // 필드 셋은 정책 판정 로그의 필수 목록이다(8.3 — error_code · tier · play_count)
    this.logger.log('play blocked by daily limit', {
      userId,
      contentId,
      errorCode,
      tier: user.tier,
      dailyPlayCount,
      dailyPlayLimit,
    });

    throw errorCode === ErrorCode.PLAY_LIMIT_REACHED
      ? new BusinessForbiddenException({
          errorCode,
          message: '오늘 청취 한도를 모두 사용했어요',
          logLevel: 'info',
        })
      : new BusinessForbiddenException({
          errorCode,
          message: '오늘 들을 수 있는 콘텐츠를 모두 들었어요',
          logLevel: 'info',
        });
  }
}
