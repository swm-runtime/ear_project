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
  /**
   * 회수 동기화 커서(partner-control.md 4.3 · player-api.md 4.6) — 마지막으로 회수 목록을
   * 받아간 시각(ISO8601). 다음 조회의 `since`가 된다.
   *
   * 기기 시각으로 적는다. 정책 판정이 아니라 "어디까지 받아갔나" 표시라 허용되지만,
   * 시계가 앞서 있으면 그 사이 회수분을 건너뛴다 — 조회 시 여유(`SYNC_SKEW_MARGIN_MS`)를
   * 빼서 겹쳐 받는다. 중복 수신은 무해하다(이미 사라진 것을 다시 지울 뿐).
   */
  PLAYER_WITHDRAWN_SYNCED_AT: 'player.withdrawn_synced_at',
  /**
   * 마지막으로 본 탭과 그 시각(`splash.md` 4장 4-1). `<탭>:<epoch ms>` 꼴.
   * 30분이 지나면 무시하고 라이브러리로 간다. 기기 로컬 전용 — 서버에 보내지 않는다
   * (기기마다 마지막으로 본 탭이 다른 것이 자연스럽다). 로그아웃 시 지운다.
   */
  LAST_TAB: 'nav.last_tab',
  /**
   * 재생 목록의 사용자 지정 순서 — `library_items.id` 의 나열(JSON). 기기 로컬 전용이다: 재생 목록의 원천이
   * 라이브러리 첫 페이지라 서버에 순서를 둘 자리가 없다(player/services/queue-order.ts). 판정이 아니라
   * 표시 순서다. 로그아웃 때 지우지 않는다 — 다른 계정의 목록에는 이 id 들이 없어 저절로 무시된다.
   */
  PLAYER_QUEUE_ORDER: 'player.queue_order',
  /**
   * Meta 광고 측정의 `first_play` 를 이미 보낸 계정 해시 목록(쉼표 구분, KAN-94). 기기 로컬 —
   * 광고 최적화 목표는 기기당 1회면 충분해 서버 계약을 늘리지 않는다(`shared/analytics/meta.ts`)
   */
  META_FIRST_PLAY_SENT: 'analytics.meta_first_play_sent',
} as const;
