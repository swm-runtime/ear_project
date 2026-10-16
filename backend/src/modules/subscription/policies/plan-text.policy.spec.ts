import { UserMarket } from '@/modules/user/user.enum';

import { planTextOf } from './plan-text.policy';

const DAILY = {
  name: '데일리',
  description: '하루 5편까지 들을 수 있어요',
  nameEn: 'Daily',
  descriptionEn: 'Listen to up to 5 episodes a day',
};

describe('planTextOf — 요금제 문구의 언어는 시장으로 고른다', () => {
  it('GLOBAL 사용자에게는 영어 이름·설명을 준다', () => {
    expect(planTextOf(DAILY, UserMarket.GLOBAL)).toEqual({
      name: 'Daily',
      description: 'Listen to up to 5 episodes a day',
    });
  });

  it('KR 사용자에게는 종전 한국어 그대로다', () => {
    expect(planTextOf(DAILY, UserMarket.KR)).toEqual({
      name: '데일리',
      description: '하루 5편까지 들을 수 있어요',
    });
  });

  it('영어 문구가 비어 있으면 GLOBAL도 한국어로 내려간다 — 빈 칸보다 낫다', () => {
    expect(
      planTextOf(
        { ...DAILY, nameEn: null, descriptionEn: null },
        UserMarket.GLOBAL,
      ),
    ).toEqual({ name: '데일리', description: '하루 5편까지 들을 수 있어요' });
  });
});
