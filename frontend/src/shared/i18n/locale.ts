/**
 * 표시 언어·기기 로캘·시간대(KAN-194 — `spec/api/global-api.md` 2.2·2.3).
 *
 * **표시 언어 = 기기 언어**다. 기기 언어가 한국어면 `ko`, 그 밖은 전부 `en`(1단계는 두 언어뿐 — RTL·추가 언어는 범위 밖).
 * 설정에서 표시 언어를 바꾸는 것은 글로벌 2번 티켓(KAN-195) 몫이다.
 *
 * 기기 값은 JS 표준 `Intl` 로 읽는다 — Hermes 는 기기 로캘·시간대를 그대로 돌려준다. expo-localization 은 네이티브 모듈이라
 * 빌드가 필요해 이 단계에서는 쓰지 않는다(현지화 빌드 KAN-198 에서 바꿀 수 있다). 읽지 못하면 종전 동작인 한국어로 둔다.
 *
 * **시장(`users.market`) 판정이 아니다** — 시장은 가입 때 서버가 정한다. 이 값은 화면 문구와 요청 헤더(로그·통계용)에만 쓴다.
 */
export type AppLanguage = 'ko' | 'en';

const FALLBACK_LOCALE = 'ko-KR';
const FALLBACK_TIMEZONE = 'Asia/Seoul';

const resolveDeviceIntl = (): { locale: string; timeZone: string } => {
  try {
    const options = Intl.DateTimeFormat().resolvedOptions();
    return {
      locale: options.locale || FALLBACK_LOCALE,
      timeZone: options.timeZone || FALLBACK_TIMEZONE,
    };
  } catch {
    return { locale: FALLBACK_LOCALE, timeZone: FALLBACK_TIMEZONE };
  }
};

const deviceIntl = resolveDeviceIntl();

/** 기기 로캘(BCP 47, 예 `en-US` · `ko-KR`) — `Accept-Language` 헤더 값 */
export const DEVICE_LOCALE: string = deviceIntl.locale;

/** 기기 시간대(IANA, 예 `America/New_York`) — `X-Timezone` 헤더 값. 정책 판정에 쓰지 않는다 */
export const DEVICE_TIMEZONE: string = deviceIntl.timeZone;

/** 로캘 문자열 → 표시 언어. 한국어만 `ko`, 나머지는 `en` */
export const toAppLanguage = (locale: string): AppLanguage =>
  locale.toLowerCase().startsWith('ko') ? 'ko' : 'en';

/** 지금 표시 언어 — 앱 실행 동안 바뀌지 않는다(기기 언어를 바꾸면 앱이 다시 뜬다) */
export const APP_LANGUAGE: AppLanguage = toAppLanguage(DEVICE_LOCALE);
