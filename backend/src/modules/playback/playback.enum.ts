/**
 * domain.md 6.4 — **추천 스코어링 입력 전용이다**(A-7).
 * `drip-scheduling.md` 4.3 신호 해석 표에 쓰이는 행동만 담는다.
 *
 * `seek` · `rate_change` · `share`는 넣지 않는다 — 스코어링에 쓰이지 않으면서 재생 1회당
 * 수십 건씩 쌓여 테이블 대부분을 차지한다. 원문 유입 클릭도 목적이 달라 별도 테이블
 * (`source_link_clicks`)로 뺐고, `manual_complete`는 수동 완료 표시 기능 자체가 삭제됐다.
 */
export enum UserSignalAction {
  PLAY = 'play',
  COMPLETE = 'complete',
  SKIP = 'skip',
  SAVE = 'save',
  UNSAVE = 'unsave',
  DELETE = 'delete',
  REPLAY = 'replay',
}

/**
 * library-api.md 4.4 — 전환 분석용(`paywall.md` 3장)이며 **판정에 쓰지 않는다.**
 * 판정에 쓰이면 진입점을 위조해 한도를 우회할 수 있다.
 */
export enum PlayEntryPoint {
  LIBRARY = 'library',
  EXPLORE = 'explore',
  MINIPLAYER = 'miniplayer',
  PUSH = 'push',
}

/**
 * `paywall.md` 4.1의 재생 가능 판정 결과.
 *
 * 한도 소진을 **티어의 위치로 가른다** — 최상위 티어를 제외한 한도 티어(무료 포함)는
 * 페이월(`BLOCKED`)이고, 최상위 티어는 더 팔 것이 없으므로 한도 안내(`LIMIT_REACHED`)다.
 */
export enum PlayDecision {
  ALLOW = 'allow',
  BLOCKED = 'blocked',
  LIMIT_REACHED = 'limit_reached',
}
