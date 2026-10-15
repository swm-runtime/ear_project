/**
 * 서버 계약 그대로의 DTO(snake_case) — 기기 동기화 계약의 소유 문서는 onboarding-api.md 4.9다
 * (settings-api.md 1장 — 설정은 같은 엔드포인트를 참조만 한다).
 */
export interface SyncDeviceRequestDto {
  push_token: string | null;
  platform: 'ios' | 'android';
  is_os_permission_granted: boolean;
  app_version: string;
  /** 기기 언어(BCP 47)·시간대(IANA) — global-api.md 4.2(KAN-195). 서버는 users 에 반영하고 시장은 건드리지 않는다 */
  language_code?: string;
  timezone?: string;
}
