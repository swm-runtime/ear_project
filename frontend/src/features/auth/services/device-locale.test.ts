import { describe, expect, it } from '@jest/globals';

import { buildDeviceLocale, parseRegionCode } from './device-locale';

describe('parseRegionCode', () => {
  it.each([
    ['en-US', 'US'],
    ['ko-KR', 'KR'],
    ['zh-Hant-TW', 'TW'],
    ['en_GB', 'GB'],
    ['pt-br', 'BR'],
  ])('%s → %s', (tag, region) => {
    expect(parseRegionCode(tag)).toBe(region);
  });

  it.each([['en'], ['ko'], ['es-419'], ['en-u-ca-gregory'], ['de-x-ab']])(
    '%s → 지역 없음',
    (tag) => {
      expect(parseRegionCode(tag)).toBeUndefined();
    },
  );
});

describe('buildDeviceLocale', () => {
  it('기기 값을 그대로 담고 지역은 로캘에서 꺼낸다', () => {
    expect(buildDeviceLocale({ languageTag: 'en-US', timezone: 'America/New_York' })).toEqual({
      languageCode: 'en-US',
      regionCode: 'US',
      timezone: 'America/New_York',
    });
  });

  it('지역이 없으면 regionCode 키가 없다', () => {
    expect(buildDeviceLocale({ languageTag: 'ko', timezone: 'Asia/Seoul' })).not.toHaveProperty(
      'regionCode',
    );
  });

  it('고른 콘텐츠 언어는 넘겼을 때만 담는다', () => {
    expect(
      buildDeviceLocale({ languageTag: 'en-US', timezone: 'Asia/Seoul', preferredLanguage: 'ko' }),
    ).toMatchObject({ preferredLanguage: 'ko', languageCode: 'en-US' });
    expect(buildDeviceLocale({ languageTag: 'en-US', timezone: 'Asia/Seoul' })).not.toHaveProperty(
      'preferredLanguage',
    );
  });
});
