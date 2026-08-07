/** convention.md 4.3 — 스토리지 키는 이 파일 한 곳에서만 관리한다. 리터럴 키 산재 금지. */
export const STORAGE_KEYS = {
  /** SecureStore — 토큰은 SecureStore 전용 (architecture.md 7.2) */
  ACCESS_TOKEN: 'auth.access_token',
  REFRESH_TOKEN: 'auth.refresh_token',
  /** 푸시 토큰 매핑용 기기 식별자 (auth-api.md 4.1) */
  DEVICE_ID: 'device.id',
  /**
   * [오늘은 그만 보기]로 재생 확인 팝업을 억제한 서비스 날짜(library.md 4.3).
   * 타이머가 아니라 날짜 자체를 저장한다 — 서버 service_date와 다르면 억제가 풀린 것으로 본다.
   */
  LIBRARY_PLAY_CONFIRM_SUPPRESSED_DATE: 'library.play_confirm_suppressed_date',
} as const;
