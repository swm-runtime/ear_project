/**
 * explore-api.md 4.1 — 섹션의 종류.
 *
 * **분석·로깅용이며 클라이언트는 화면 분기에 쓰지 않는다.** 화면에 그리는 것은 `title`
 * 문자열이고, 구성·순서·제목은 전부 서버 제어다(`explore.md` 4.1) — 클라이언트가 `key`로
 * 제목을 조립하면 서버가 섹션을 바꿀 수 없다.
 *
 * 시리즈·출처별 섹션(PRD 4.2 확장 필터)이 들어오면 값이 늘어난다. 위 규약을 지켜야
 * 앱 배포 없이 확장할 수 있다.
 */
export enum ExploreSectionKey {
  /** 관심 주제 + 소비 신호 기반 랭킹 */
  INTEREST = 'interest',
  /** `published_at` 최신순 */
  NEW = 'new',
  /** `content_stats`의 직전 확정 구간 기준 */
  POPULAR = 'popular',
  /** 관심 주제 하나를 묶은 섹션. 이 값일 때만 `topic`이 채워진다 */
  TOPIC_GROUP = 'topic_group',
}

/**
 * explore-api.md 4.3 — 담기가 어떤 조작에서 비롯됐는가.
 *
 * **`user_signals` 적재 여부만 가른다.** 라이브러리 행 생성은 두 값이 동일하다.
 * 자동 적립(`auto_play`)은 사용자의 "담기" 의사가 아니므로 `save` 신호를 남기지 않는다 —
 * 남기면 추천 입력이 왜곡된다. `play` 신호는 재생 시작이 이미 적재했다.
 */
export enum SaveReason {
  USER_SAVE = 'user_save',
  AUTO_PLAY = 'auto_play',
}
