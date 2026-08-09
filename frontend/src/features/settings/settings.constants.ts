/**
 * 백엔드 준비 후 실서버로 붙일 때는 EXPO_PUBLIC_SETTINGS_API=real 로 전환한다.
 */
export const IS_SETTINGS_API_MOCKED = __DEV__ && process.env.EXPO_PUBLIC_SETTINGS_API !== 'real';

/**
 * 외부 목적지 URL — 원천은 배포 설정이다(settings-api.md 1장 경계 표: 서버 엔드포인트가 없다).
 * dev 폴백은 화면 흐름 확인용 임시값이며, 배포 시 env로 실값을 주입한다.
 */
export const KAKAO_CHANNEL_URL =
  process.env.EXPO_PUBLIC_KAKAO_CHANNEL_URL ?? 'https://pf.kakao.com/_ear_dev';
export const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://ear.example.com/terms';
export const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? 'https://ear.example.com/privacy';
/** [업데이트] 버튼의 목적지 — 스토어 등록 후 실값으로 교체한다 */
export const STORE_URL = process.env.EXPO_PUBLIC_STORE_URL ?? 'https://ear.example.com/store';
