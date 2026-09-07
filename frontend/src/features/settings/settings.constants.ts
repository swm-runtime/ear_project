/**
 * 백엔드 준비 후 실서버로 붙일 때는 EXPO_PUBLIC_SETTINGS_API=real 로 전환한다.
 */
export const IS_SETTINGS_API_MOCKED = __DEV__ && process.env.EXPO_PUBLIC_SETTINGS_API !== 'real';

/**
 * 외부 목적지 URL — 원천은 배포 설정이다(settings-api.md 1장 경계 표: 서버 엔드포인트가 없다).
 *
 * **폴백을 실값으로 둔다.** 예전 폴백은 `ear.example.com`(존재하지 않는 도메인)이었고
 * eas.json 에 값이 없어, 스토어 빌드의 [이용약관]·[개인정보처리방침]·[업데이트]가 전부
 * 죽은 링크로 나갔다. env 누락이 조용히 사고가 되지 않게 폴백 자체를 실값으로 맞춘다
 * (공유 플래그를 기본 켬으로 둔 것과 같은 이유 — share.constants.ts).
 */
export const KAKAO_CHANNEL_URL =
  process.env.EXPO_PUBLIC_KAKAO_CHANNEL_URL ?? 'https://pf.kakao.com/_ear_dev';
export const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://earcast.co.kr/terms';
export const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? 'https://earcast.co.kr/privacy';
/** [업데이트] 버튼의 목적지. 스토어 게시 전에는 Play 가 "찾을 수 없음"을 보여준다 */
export const STORE_URL =
  process.env.EXPO_PUBLIC_STORE_URL ??
  'https://play.google.com/store/apps/details?id=com.runtime.ear';
