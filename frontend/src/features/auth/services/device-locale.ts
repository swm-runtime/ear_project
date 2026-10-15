import { DEVICE_LOCALE, DEVICE_TIMEZONE } from '@/shared/i18n/locale';

import type { ContentLanguage } from '../auth.types';

/**
 * 가입·로그인 요청에 싣는 기기 로캘(global-api.md 4.1 `locale`).
 *
 * 기기 값 세 필드(`languageCode`·`regionCode`·`timezone`)는 **그대로 보낸다** — 시장 판정은 서버가 하고,
 * 이 값은 표시 언어 초깃값·통계·드립 발송 그룹의 입력이다. `preferredLanguage`는 사용자가 A21에서 고른
 * 값으로 **가입(sign-up)에만** 싣는다 — 기존 계정 로그인에서는 서버가 무시하는 값이라 보내지 않는다.
 */
export interface DeviceLocale {
  preferredLanguage?: ContentLanguage;
  /** BCP 47, 예 `en-US` */
  languageCode: string;
  /** ISO 3166-1 alpha-2, 예 `US`. 기기 로캘에 지역이 없으면 없다 */
  regionCode?: string;
  /** IANA, 예 `America/New_York` */
  timezone: string;
}

/**
 * BCP 47 태그에서 지역 하위 태그(ISO 3166-1 alpha-2)를 꺼낸다 — `en-US` → `US`, `zh-Hant-TW` → `TW`.
 * 계약이 alpha-2 라 숫자 지역(`es-419`)은 버린다. 확장(`-u-…`·`-x-…`) 뒤는 보지 않는다. 없으면 undefined.
 */
export const parseRegionCode = (languageTag: string): string | undefined => {
  const subtags = languageTag.replace(/_/g, '-').split('-');
  for (const subtag of subtags.slice(1)) {
    // 한 글자 하위 태그부터는 확장·사설 영역이다 — 그 안의 두 글자는 지역이 아니다
    if (subtag.length === 1) return undefined;
    if (/^[A-Za-z]{2}$/.test(subtag)) return subtag.toUpperCase();
  }
  return undefined;
};

/** 기기 값 → 요청 로캘. 지역이 없으면 키를 만들지 않는다 */
export const buildDeviceLocale = (input: {
  languageTag: string;
  timezone: string;
  preferredLanguage?: ContentLanguage;
}): DeviceLocale => {
  const regionCode = parseRegionCode(input.languageTag);
  return {
    ...(input.preferredLanguage !== undefined && { preferredLanguage: input.preferredLanguage }),
    languageCode: input.languageTag,
    ...(regionCode !== undefined && { regionCode }),
    timezone: input.timezone,
  };
};

/**
 * 지금 기기의 로캘(`shared/i18n/locale` 의 기기 값). 콘텐츠 언어를 넘기면(가입) 결과 타입에도 그 값이 있음이 드러난다 —
 * 가입 요청은 `preferredLanguage` 를 필수로 받는다.
 */
export function getDeviceLocale(): DeviceLocale;
export function getDeviceLocale(
  preferredLanguage: ContentLanguage,
): DeviceLocale & { preferredLanguage: ContentLanguage };
export function getDeviceLocale(preferredLanguage?: ContentLanguage): DeviceLocale {
  return buildDeviceLocale({
    languageTag: DEVICE_LOCALE,
    timezone: DEVICE_TIMEZONE,
    preferredLanguage,
  });
}
