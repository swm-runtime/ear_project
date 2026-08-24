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
   * 기기 단위 하나의 키 — 진입점 화면별로 따로 저장하지 않는다(explore-uiux.md 8장).
   */
  PLAY_CONFIRM_SUPPRESSED_DATE: 'player.play_confirm_suppressed_date',
  /**
   * 최근 검색어 10건(explore.md 4.5-4) — 기기 로컬 전용. 서버에 보내지 않는다
   * (SearchHistory는 테이블이 아니다 — domain.md 13.1). 재설치 시 사라지는 것이 의도다.
   * TODO(MMKV): architecture.md 7.2가 정한 저장소는 MMKV다 — 도입 시 이 값부터 이관한다.
   */
  EXPLORE_RECENT_SEARCHES: 'explore.recent_searches',
} as const;
