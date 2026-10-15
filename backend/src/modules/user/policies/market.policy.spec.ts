import { PreferredLanguage, UserMarket } from '../user.enum';
import { normalizeLocale, resolveMarket, toUserMarket } from './market.policy';

/** 글로벌 가입이 열린 상태 / 닫힌 상태(운영 기본값)의 입력 */
const OPEN = { globalSignupEnabled: true };
const CLOSED = { globalSignupEnabled: false };

describe('resolveMarket — 글로벌 가입이 열려 있을 때', () => {
  it('사용자가 고른 콘텐츠 언어가 있으면 그것이 유일한 입력이다 — 영어 기기여도 한국어를 고르면 kr', () => {
    expect(
      resolveMarket({
        ...OPEN,
        preferredLanguage: PreferredLanguage.KO,
        languageCode: 'en-US',
      }),
    ).toEqual({ market: UserMarket.KR, source: 'preferred' });
    expect(
      resolveMarket({
        ...OPEN,
        preferredLanguage: PreferredLanguage.EN,
        languageCode: 'ko-KR',
      }),
    ).toEqual({ market: UserMarket.GLOBAL, source: 'preferred' });
  });

  it('고른 값이 없으면(구 앱) 기기 언어로 폴백한다 — ko로 시작하면 kr, 그 밖은 global', () => {
    expect(resolveMarket({ ...OPEN, languageCode: 'ko-KR' })).toEqual({
      market: UserMarket.KR,
      source: 'device',
    });
    expect(resolveMarket({ ...OPEN, languageCode: 'ko' }).market).toBe(
      UserMarket.KR,
    );
    expect(resolveMarket({ ...OPEN, languageCode: 'en-US' })).toEqual({
      market: UserMarket.GLOBAL,
      source: 'device',
    });
    expect(resolveMarket({ ...OPEN, languageCode: 'ja' }).market).toBe(
      UserMarket.GLOBAL,
    );
  });

  it('아무 입력도 없으면 kr이다 — 지금 스토어의 앱이 그대로 가입된다', () => {
    expect(resolveMarket(OPEN)).toEqual({
      market: UserMarket.KR,
      source: 'default',
    });
    expect(resolveMarket({ ...OPEN, languageCode: '   ' }).market).toBe(
      UserMarket.KR,
    );
  });

  it('형식이 아닌 기기 언어는 없는 것으로 본다(kr) — 한국어 사용자를 잘못된 값으로 GLOBAL에 보내지 않는다', () => {
    expect(
      resolveMarket({ ...OPEN, languageCode: 'english language!' }),
    ).toEqual({
      market: UserMarket.KR,
      source: 'default',
    });
  });
});

describe('resolveMarket — 글로벌 가입이 닫혀 있을 때(기본값)', () => {
  it('English 를 고르면 kr 로 판정하고 사유를 global_closed 로 남긴다 — GLOBAL 카탈로그가 비어 온보딩을 못 끝낸다', () => {
    // when
    const resolved = resolveMarket({
      ...CLOSED,
      preferredLanguage: PreferredLanguage.EN,
    });

    // then
    expect(resolved).toEqual({
      market: UserMarket.KR,
      source: 'global_closed',
    });
  });

  it('구 앱이 영어 기기로 가입하면 kr 로 판정한다', () => {
    // when
    const resolved = resolveMarket({ ...CLOSED, languageCode: 'en-US' });

    // then
    expect(resolved).toEqual({
      market: UserMarket.KR,
      source: 'global_closed',
    });
  });

  it('한국어를 고르면 종전과 같이 kr 로 판정한다', () => {
    // when
    const resolved = resolveMarket({
      ...CLOSED,
      preferredLanguage: PreferredLanguage.KO,
    });

    // then
    expect(resolved).toEqual({ market: UserMarket.KR, source: 'preferred' });
  });
});

describe('normalizeLocale', () => {
  it('형식에 맞는 값은 그대로, 지역은 대문자로 저장한다', () => {
    expect(
      normalizeLocale({
        languageCode: 'en-US',
        regionCode: 'us',
        timezone: 'America/New_York',
      }),
    ).toEqual({
      languageCode: 'en-US',
      regionCode: 'US',
      timezone: 'America/New_York',
    });
  });

  it('모르는 값은 버리고 null — 형식 오류가 가입을 막지 않는다', () => {
    expect(
      normalizeLocale({
        languageCode: 'not a tag',
        regionCode: 'KOR',
        timezone: 'Mars/Olympus',
      }),
    ).toEqual({ languageCode: null, regionCode: null, timezone: null });
    expect(normalizeLocale(undefined)).toEqual({
      languageCode: null,
      regionCode: null,
      timezone: null,
    });
  });

  it('UTC는 유효한 시간대다', () => {
    expect(normalizeLocale({ timezone: 'UTC' }).timezone).toBe('UTC');
  });
});

describe('toUserMarket', () => {
  it('토큰 클레임이 global이면 GLOBAL, 그 밖(없음·모르는 값)은 KR이다 — 옛 토큰이 KR로 동작한다', () => {
    expect(toUserMarket('global')).toBe(UserMarket.GLOBAL);
    expect(toUserMarket('kr')).toBe(UserMarket.KR);
    expect(toUserMarket(undefined)).toBe(UserMarket.KR);
    expect(toUserMarket('mars')).toBe(UserMarket.KR);
  });
});
