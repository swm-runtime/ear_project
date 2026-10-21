import { UserMarket } from '@/modules/user/user.enum';

import { scoringCareerOf } from './drip-career.policy';

describe('scoringCareerOf', () => {
  const career = { jobCategory: '개발', yearsOfExperience: 2 };

  it('KR 사용자는 커리어를 점수에 쓴다', () => {
    expect(scoringCareerOf({ market: UserMarket.KR, ...career })).toEqual(
      career,
    );
  });

  it('GLOBAL로 옮긴 사용자에게 남은 KR 커리어는 쓰지 않는다(global-api 4.11)', () => {
    expect(
      scoringCareerOf({ market: UserMarket.GLOBAL, ...career }),
    ).toBeNull();
  });
});
