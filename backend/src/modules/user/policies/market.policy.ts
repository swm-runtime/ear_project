import { PreferredLanguage, UserMarket } from '../user.enum';
import { LocaleInput, NormalizedLocale } from '../user.types';

/**
 * 시장 판정(`global-api.md` 2.1) — **계정 생성 시 1회**만 부른다.
 *
 * 입력은 사용자가 가입 화면에서 고른 콘텐츠 언어다. 기기 언어로 자동 판정하면 영어 설정을 쓰는 한국 사용자가
 * GLOBAL로 가고 되돌릴 길이 없어서(시장 전환 불허) 사용자에게 묻는다(2026-10-14). 고른 값이 없으면(구 앱) 기기
 * 언어로 폴백하고, 그것도 없으면 `kr` — 지금 스토어에 있는 앱이 그대로 가입되는 이유다.
 */
export function resolveMarket(input: {
  preferredLanguage?: PreferredLanguage | null;
  languageCode?: string | null;
}): { market: UserMarket; source: 'preferred' | 'device' | 'default' } {
  if (input.preferredLanguage === PreferredLanguage.KO) {
    return { market: UserMarket.KR, source: 'preferred' };
  }
  if (input.preferredLanguage === PreferredLanguage.EN) {
    return { market: UserMarket.GLOBAL, source: 'preferred' };
  }

  const languageCode = normalizeLanguageCode(input.languageCode);
  if (languageCode === null) {
    return { market: UserMarket.KR, source: 'default' };
  }

  const primary = languageCode.split('-')[0].toLowerCase();
  return {
    market: primary === 'ko' ? UserMarket.KR : UserMarket.GLOBAL,
    source: 'device',
  };
}

// BCP 47 language tag — primary subtag + 선택 subtag들. 형식만 본다(값의 실존은 보지 않는다)
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const REGION_CODE = /^[A-Za-z]{2}$/;

let supportedTimeZones: Set<string> | null = null;

function isSupportedTimeZone(value: string): boolean {
  if (supportedTimeZones === null) {
    supportedTimeZones = new Set([
      ...Intl.supportedValuesOf('timeZone'),
      'UTC',
    ]);
  }
  return supportedTimeZones.has(value);
}

export function normalizeLanguageCode(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 16 || !LANGUAGE_TAG.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * 클라이언트가 보낸 로케일을 저장 가능한 값으로 — **모르는 값은 버리고 null**(`global-api.md` 7장). 형식 오류로
 * 가입을 막지 않는다: 로케일은 판정 입력이자 통계값이지 자격 조건이 아니다.
 */
export function normalizeLocale(
  input: LocaleInput | undefined,
): NormalizedLocale {
  const region = input?.regionCode?.trim();
  const timezone = input?.timezone?.trim();

  return {
    languageCode: normalizeLanguageCode(input?.languageCode),
    regionCode:
      region && REGION_CODE.test(region) ? region.toUpperCase() : null,
    timezone: timezone && isSupportedTimeZone(timezone) ? timezone : null,
  };
}
