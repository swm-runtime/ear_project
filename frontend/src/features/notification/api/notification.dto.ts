/**
 * 서버 계약 그대로의 DTO(snake_case) — 기기 동기화 계약의 소유 문서는 onboarding-api.md 4.9다
 * (settings-api.md 1장 — 설정은 같은 엔드포인트를 참조만 한다).
 */
export interface SyncDeviceRequestDto {
  push_token: string | null;
  platform: 'ios' | 'android';
  is_os_permission_granted: boolean;
  app_version: string;
}
