import { User } from '@/modules/user/entities/user.entity';
import { UserMarket } from '@/modules/user/user.enum';

import { UserCareer } from './drip.types';

/**
 * 커리어 적합도(`drip-scheduling.md` 4.2 ③)의 입력 — **KR 시장만** 쓴다.
 *
 * 커리어는 한국 직군 분류라 GLOBAL에는 고를 단계가 없다(`global-api.md` 4.4). 그런데 KR에서 GLOBAL로 옮긴
 * 사용자(4.11)는 예전 커리어 값이 남아 있어, 그대로 넘기면 영어 콘텐츠 점수에 한국 직군 적합도가 섞인다.
 * 값을 지우지 않는 이유는 되돌아왔을 때 다시 묻지 않으려는 것이다.
 */
export function scoringCareerOf(
  user: Pick<User, 'market' | 'jobCategory' | 'yearsOfExperience'>,
): UserCareer | null {
  if (user.market !== UserMarket.KR) {
    return null;
  }

  return {
    jobCategory: user.jobCategory,
    yearsOfExperience: user.yearsOfExperience,
  };
}
