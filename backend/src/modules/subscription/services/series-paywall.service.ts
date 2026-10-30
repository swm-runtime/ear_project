import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';

import { EnvironmentVariables } from '@/config/env.validation';
import { isSignupTrialActive } from '@/common/utils/signup-trial.util';
import { User } from '@/modules/user/entities/user.entity';
import { UserTier } from '@/modules/user/user.enum';

import {
  SERIES_ALL_UNLOCKED,
  SeriesEpisodeAccess,
  parseSeriesFreeEpisodes,
  parseSeriesPaywallEnabled,
  resolveSeriesEpisodeAccess,
} from '../policies/series-paywall.policy';
import { PlanService } from './plan.service';

/** 배치가 사용자마다 요금제를 다시 읽지 않도록 넘기는 캐시 — 저장 티어 → 유료 요금제인가 */
export type SeriesPaidTierCache = Map<UserTier, boolean>;

/**
 * 시리즈 유료화(KAN-290)의 **서버 한 곳** — 규칙은 `series-paywall.policy.ts`, 이 클래스는 설정값과 요금제를 붙인다.
 *
 * "열리는 사람"을 티어명이 아니라 **요금제 데이터로** 판정한다 — 저장 티어가 유료 요금제(`PlanService.isPaidTier` — `price_krw > 0`,
 * 현재 daily · pro)인가(2026-10-30 팀 결정 — 종전 "최상위 요금제만"에서 daily까지 연다). 요금제 행이 없으면 폴백(라이트)대로
 * 유료가 아니다 — 모를 때는 잠그는 쪽이다.
 *
 * 설정값은 **부를 때마다 읽는다** — 다른 실험 스위치(`DRIP_ARRIVAL_AB_ENABLED`)와 같고, 테스트가 `ConfigService.set`으로 바꾼다.
 */
@Injectable()
export class SeriesPaywallService {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly planService: PlanService,
  ) {}

  /** 서버 스위치 `SERIES_PAYWALL_ENABLED` — `true`를 명시했을 때만 켜진다 */
  isEnabled(): boolean {
    return parseSeriesPaywallEnabled(
      this.configService.get('SERIES_PAYWALL_ENABLED', { infer: true }),
    );
  }

  /** 무료 편수 `SERIES_FREE_EPISODES` — 비우면 3 */
  freeEpisodes(): number {
    return parseSeriesFreeEpisodes(
      this.configService.get('SERIES_FREE_EPISODES', { infer: true }),
    );
  }

  /**
   * 사용자 한 명의 접근. 스위치가 꺼져 있으면 요금제를 읽지 않는다. `cache`는 배치(드립)가 사용자 사이에 공유한다.
   */
  async resolveAccess(
    user: Pick<User, 'tier' | 'trialEndsAt'>,
    now: Date,
    manager?: EntityManager,
    cache?: SeriesPaidTierCache,
  ): Promise<SeriesEpisodeAccess> {
    if (!this.isEnabled()) {
      return SERIES_ALL_UNLOCKED;
    }

    const isTrialActive = isSignupTrialActive(user.trialEndsAt, now);

    return resolveSeriesEpisodeAccess({
      enabled: true,
      freeEpisodes: this.freeEpisodes(),
      // 체험 중이면 요금제를 볼 필요가 없다
      isPaidSubscriber: isTrialActive
        ? false
        : await this.isPaidTier(user.tier, manager, cache),
      isTrialActive,
    });
  }

  /**
   * SQL판(`seriesEpisodeUnlockedSql`)의 파라미터 — 스위치가 꺼져 있으면 `lockedAfterEpisodeNo = null`(아무것도 잠그지 않음).
   * 열리는 저장 티어는 결제가 쓰는 세 티어 중 유료 요금제인 것이다(`trial`은 저장 티어가 아니다 — 체험은 `trial_ends_at`으로 본다)
   */
  async resolveSqlParams(manager?: EntityManager): Promise<{
    lockedAfterEpisodeNo: number | null;
    unlockedTiers: UserTier[];
  }> {
    if (!this.isEnabled()) {
      return { lockedAfterEpisodeNo: null, unlockedTiers: [] };
    }

    const storedTiers = Object.values(UserTier).filter(
      (tier) => tier !== UserTier.TRIAL,
    );
    const cache: SeriesPaidTierCache = new Map();
    const unlockedTiers: UserTier[] = [];

    for (const tier of storedTiers) {
      if (await this.isPaidTier(tier, manager, cache)) {
        unlockedTiers.push(tier);
      }
    }

    return { lockedAfterEpisodeNo: this.freeEpisodes(), unlockedTiers };
  }

  private async isPaidTier(
    tier: UserTier,
    manager: EntityManager | undefined,
    cache: SeriesPaidTierCache | undefined,
  ): Promise<boolean> {
    const cached = cache?.get(tier);

    if (cached !== undefined) {
      return cached;
    }

    const isPaid = await this.planService.isPaidTier(tier, manager);
    cache?.set(tier, isPaid);

    return isPaid;
  }
}
