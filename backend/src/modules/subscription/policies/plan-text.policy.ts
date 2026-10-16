import { messageLanguageOf } from '@/modules/user/policies/market.policy';
import { MessageLanguage, UserMarket } from '@/modules/user/user.enum';

import { Plan } from '../entities/plan.entity';

/** 화면에 그릴 요금제 문구 */
export interface PlanText {
  name: string;
  description: string;
}

/**
 * 요금제 이름·설명 — **사용자 시장의 언어로** 고른다(domain.md 8.1, 2026-10-16). 앱은 받은 문구를 그대로 그리므로
 * 문구의 원천은 이 한 곳이다 — 앱이 티어별 문구를 따로 들고 있으면 한도를 바꿀 때 두 곳이 어긋난다.
 *
 * 언어는 기기 언어가 아니라 시장으로 정한다(푸시·인증 메일과 같은 `messageLanguageOf`). 영어 문구가 비어 있으면
 * 한국어로 내려간다 — 빈 칸을 그리는 것보다 낫다.
 */
export function planTextOf(
  plan: Pick<Plan, 'name' | 'description' | 'nameEn' | 'descriptionEn'>,
  market: UserMarket,
): PlanText {
  if (messageLanguageOf(market) !== MessageLanguage.EN) {
    return { name: plan.name, description: plan.description };
  }

  return {
    name: plan.nameEn ?? plan.name,
    description: plan.descriptionEn ?? plan.description,
  };
}
