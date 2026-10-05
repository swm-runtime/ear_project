/**
 * 약관·개인정보처리방침 목적지 — 설정 [이용약관]·[개인정보처리방침]과 구독 화면·페이월의 필수 표기 링크가
 * 같은 주소를 쓴다(subscription.md 5장 "약관·개인정보처리방침 링크"). 원천은 배포 설정이고
 * **폴백을 실값으로 둔다** — env 누락이 죽은 링크로 나가지 않게(settings.constants.ts 와 같은 이유).
 */
export const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://earcast.co.kr/terms';
export const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? 'https://earcast.co.kr/privacy';
