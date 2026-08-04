/** convention.md 4.3 — 스토리지 키는 이 파일 한 곳에서만 관리한다. 리터럴 키 산재 금지. */
export const STORAGE_KEYS = {
  /** SecureStore — 토큰은 SecureStore 전용 (architecture.md 7.2) */
  ACCESS_TOKEN: 'auth.access_token',
  REFRESH_TOKEN: 'auth.refresh_token',
  /** 푸시 토큰 매핑용 기기 식별자 (auth-api.md 4.1) */
  DEVICE_ID: 'device.id',
} as const;
