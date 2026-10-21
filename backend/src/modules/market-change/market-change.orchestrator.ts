import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { TokenService } from '@/modules/auth/services/token.service';
import { FirstDripService } from '@/modules/drip/services/first-drip.service';
import { TopicService } from '@/modules/interest/services/topic.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { User } from '@/modules/user/entities/user.entity';
import { marketOfPreferredLanguage } from '@/modules/user/policies/market.policy';
import { onboardingStepsFor } from '@/modules/user/policies/onboarding-steps.policy';
import { ConsentService } from '@/modules/user/services/consent.service';
import { UserMarketChangeService } from '@/modules/user/services/user-market-change.service';
import { UserService } from '@/modules/user/services/user.service';
import { PreferredLanguage, UserMarket } from '@/modules/user/user.enum';
import { ConsentInput } from '@/modules/user/user.types';

import {
  MarketChangeBlockedReason,
  MarketChangePreview,
  MarketChangeResult,
} from './market-change.types';

/**
 * 가입 뒤 시장 전환(`global-api.md` 4.11 — KAN-227, 2026-10-19). architecture.md 3.3 — 사용자 행·동의(`user`), 관심 주제·노출
 * 주제(`interest`), 첫 드립 작업(`drip`), access token(`auth`)을 함께 바꾸는 유스케이스라 소유 모듈들 **위에서** 조합한다.
 *
 * **한 트랜잭션으로 묶는다**(architecture.md 8.1의 Orchestrator 기본값 — 단계별 트랜잭션 — 의 예외). 단계 사이에서 끊기면 시장만
 * 바뀌고 동의가 없거나, 관심 주제가 이전 시장 것으로 남는다 — 어느 쪽이든 사용자가 스스로 복구할 길이 없다. 단계마다 몇 행이라
 * 짧고, 외부 호출이 없다(토큰 발급은 커밋 뒤 서명만).
 */
@Injectable()
export class MarketChangeOrchestrator {
  constructor(
    private readonly userService: UserService,
    private readonly userMarketChangeService: UserMarketChangeService,
    private readonly consentService: ConsentService,
    private readonly topicService: TopicService,
    private readonly userInterestService: UserInterestService,
    private readonly firstDripService: FirstDripService,
    private readonly tokenService: TokenService,
    private readonly dataSource: DataSource,
  ) {}

  /** 아무것도 바꾸지 않는다 — 전환과 같은 판정으로 막힘 사유와 받아야 할 동의를 미리 준다 */
  async preview(
    userId: string,
    preferredLanguage: PreferredLanguage,
    now: Date,
  ): Promise<MarketChangePreview> {
    const user = await this.userService.getById(userId);
    const target = marketOfPreferredLanguage(preferredLanguage);
    const base = {
      currentMarket: user.market,
      targetMarket: target,
      steps: onboardingStepsFor(target),
    };

    if (target === user.market) {
      return {
        ...base,
        blockedReason: null,
        retryAfterSec: null,
        requiredConsents: [],
      };
    }

    const requiredConsents = this.consentService.buildRequiredConsents({
      market: target,
      regionCode: user.regionCode,
    });

    if (!(await this.isTargetAvailable(target))) {
      return {
        ...base,
        blockedReason: MarketChangeBlockedReason.MARKET_UNAVAILABLE,
        retryAfterSec: null,
        requiredConsents,
      };
    }

    const cooldown = await this.userMarketChangeService.judgeCooldown(
      user,
      target,
      now,
    );

    return {
      ...base,
      blockedReason:
        cooldown.retryAfterSec === null
          ? null
          : MarketChangeBlockedReason.COOLDOWN,
      retryAfterSec: cooldown.retryAfterSec,
      requiredConsents,
    };
  }

  async change(
    userId: string,
    preferredLanguage: PreferredLanguage,
    consents: ConsentInput[],
    now: Date,
  ): Promise<MarketChangeResult> {
    const target = marketOfPreferredLanguage(preferredLanguage);

    const { user, changed } = await this.dataSource.transaction(
      async (manager): Promise<{ user: User; changed: boolean }> => {
        // 동시 전환 두 건이 같은 스냅샷에서 하루 1회 판정을 통과하지 않게 사용자 행을 잠근다
        const locked = await this.userService.getByIdForUpdate(userId, manager);

        // 이미 그 시장이다 — 재시도·연타가 안전하다(멱등). 동의도 쿨다운도 보지 않는다
        if (locked.market === target) {
          return { user: locked, changed: false };
        }

        if (!(await this.isTargetAvailable(target))) {
          throw new BusinessException({
            status: HttpStatus.CONFLICT,
            errorCode: ErrorCode.MARKET_UNAVAILABLE,
            message: '지금은 이 언어로 바꿀 수 없어요',
            logLevel: 'info',
          });
        }

        const cooldown = await this.userMarketChangeService.judgeCooldown(
          locked,
          target,
          now,
          manager,
        );
        this.userMarketChangeService.assertNoCooldown(cooldown);

        // 동의 없이는 전환하지 않는다 — 동의 전에 새 시장 콘텐츠가 나가는 틈을 만들지 않는다
        await this.consentService.recordForMarketChange(
          locked.id,
          { market: target, regionCode: locked.regionCode },
          consents,
          now,
          manager,
        );
        await this.userInterestService.deactivateAllForMarketChange(
          locked.id,
          now,
          manager,
        );
        await this.firstDripService.resetForMarketChange(locked.id, manager);

        return {
          user: await this.userMarketChangeService.apply(
            locked,
            target,
            cooldown.isRevert,
            now,
            manager,
          ),
          changed: true,
        };
      },
    );

    if (!changed) {
      return { user, changed, accessToken: null, accessTokenExpiresAt: null };
    }

    // 시장은 access token 클레임이다(global-api.md 7장) — 새 토큰을 주지 않으면 30분간 탐색(토큰)과 관심 주제(DB)가 다른 시장을 본다
    const accessToken = this.tokenService.issueAccessToken(user, now);

    return {
      user,
      changed,
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt,
    };
  }

  /** 서버 스위치가 열려 있고 고를 주제가 있어야 한다 — 빈 시장으로 옮기면 온보딩 주제 단계에서 멈춘다 */
  private async isTargetAvailable(target: UserMarket): Promise<boolean> {
    return (
      this.userMarketChangeService.isTargetOpen(target) &&
      (await this.topicService.hasSelectableTopics(target))
    );
  }
}
