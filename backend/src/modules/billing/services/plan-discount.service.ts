import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';
import { UserTier } from '@/modules/user/user.enum';

import {
  PlanDiscount,
  PlanDiscountConfig,
  planDiscountConfigOf,
  resolvePlanDiscount,
} from '../plan-discount.policy';

/**
 * 요금제 할인 표시 설정(`PLAN_DISCOUNT_*`, KAN-286)을 기동 때 한 번 읽는다 — 다른 서버 스위치와 같이 값을 바꾸면
 * API를 다시 띄운다(앱 배포는 필요 없다). 판정은 `resolvePlanDiscount`(순수 함수)가 한다.
 */
@Injectable()
export class PlanDiscountService {
  private readonly config: PlanDiscountConfig;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.config = planDiscountConfigOf((key) =>
      configService.get<string | undefined>(key as keyof EnvironmentVariables),
    );
  }

  resolve(
    plan: {
      tier: UserTier;
      priceKrw: number;
      isFree: boolean;
    },
    now: Date = new Date(),
  ): PlanDiscount {
    return resolvePlanDiscount(plan, this.config, now);
  }
}
