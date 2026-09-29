/**
 * 추천 테스트 콘솔이 테스트 계정에 대신 수행하는 행동 — 앱이 추천에 남기는 신호와 1:1이다
 * (`user_signals.action` — domain.md 6.4). 새 행동을 더할 때는 앱의 같은 경로(서비스 메서드)를
 * 그대로 불러야 한다. 여기서 신호를 직접 적재하면 "앱과 같은 결과"라는 이 콘솔의 전제가 깨진다.
 */
export enum RecommendTestAction {
  /** 재생 시작 — 라이브러리에 없으면 탐색 재생과 같이 자동 적립(`auto_play`) 후 시작 */
  PLAY = 'play',
  /** 완청 — 재생 시작 후 위치를 끝까지 저장해 완청 판정(90%)을 지나게 한다 */
  COMPLETE = 'complete',
  SAVE = 'save',
  UNSAVE = 'unsave',
  /** 라이브러리 삭제 — 영구 제외 + 부정 신호 */
  DELETE = 'delete',
  /** 완료 항목의 재청취 — 완료 상태가 아니면 앱과 같이 무시된다 */
  REPLAY = 'replay',
}
