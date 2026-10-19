import { MessageLanguage, PreferredLanguage, UserMarket } from '../user.enum';
import { LocaleInput, NormalizedLocale, SignUpMarket } from '../user.types';

/**
 * 시장 판정(`global-api.md` 2.1) — **계정 생성 시 1회**만 부른다. 가입 뒤의 전환은 `marketOfPreferredLanguage`(4.11)다.
 *
 * 입력은 사용자가 가입 화면에서 고른 콘텐츠 언어다. 기기 언어로 자동 판정하면 영어 설정을 쓰는 한국 사용자가
 * GLOBAL로 가서(당시엔 시장 전환이 없어 되돌릴 길도 없었다) 사용자에게 묻는다(2026-10-14). 고른 값이 없으면(구 앱) 기기
 * 언어로 폴백하고, 그것도 없으면 `kr` — 지금 스토어에 있는 앱이 그대로 가입되는 이유다.
 *
 * **글로벌 가입이 닫혀 있으면(`globalSignupEnabled = false`) GLOBAL 판정도 `kr`로 만든다**(source `global_closed`,
 * 2026-10-15). GLOBAL 카탈로그(주제·콘텐츠)가 비어 있는 동안 GLOBAL로 가입하면
 * 온보딩 주제가 0개라 진행할 수 없다. 앱이 언어 선택을 먼저 내보내도 서버가 막는다.
 */
export function resolveMarket(input: {
  preferredLanguage?: PreferredLanguage | null;
  languageCode?: string | null;
  globalSignupEnabled: boolean;
}): SignUpMarket {
  const resolved = resolveRequestedMarket(input);

  if (resolved.market === UserMarket.GLOBAL && !input.globalSignupEnabled) {
    return { market: UserMarket.KR, source: 'global_closed' };
  }

  return resolved;
}

/** 요청이 가리키는 시장 — 글로벌 가입 스위치를 보기 전의 판정 */
function resolveRequestedMarket(input: {
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

/**
 * 시장 전환(`global-api.md` 4.11)의 목표 시장 — 클라이언트는 `market`이 아니라 고른 콘텐츠 언어를 보낸다(7장).
 * 가입과 같은 대응(`ko` → `kr`, `en` → `global`)이다. 글로벌 가입 스위치로 바꿔치지 않는다 — 닫혀 있으면 전환을 거부한다
 */
export function marketOfPreferredLanguage(
  preferredLanguage: PreferredLanguage,
): UserMarket {
  return preferredLanguage === PreferredLanguage.EN
    ? UserMarket.GLOBAL
    : UserMarket.KR;
}

/**
 * 서버 문구(푸시·인증 메일)의 언어 — **시장으로 고른다**(1단계, `global-api.md` 2.3). 시장마다 콘텐츠 언어가 하나라
 * (KR = 한국어 · GLOBAL = 영어) 문구도 그 언어를 따른다. 기기 언어(`language_code`)로 고르면 영어 기기를 쓰는 KR
 * 사용자가 한국어 콘텐츠를 영어 알림으로 받는다. 시장 안에 언어가 둘 이상이 되면(2단계) `language_code`로 넓힌다.
 */
export function messageLanguageOf(market: UserMarket): MessageLanguage {
  return market === UserMarket.GLOBAL ? MessageLanguage.EN : MessageLanguage.KO;
}

/** 토큰 클레임(문자열)을 enum으로 — 모르는 값은 `kr`(옛 토큰·위조 불가한 서명값이라 정상 경로에선 항상 enum 값이다) */
export function toUserMarket(value: string | undefined | null): UserMarket {
  return value === UserMarket.GLOBAL ? UserMarket.GLOBAL : UserMarket.KR;
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
