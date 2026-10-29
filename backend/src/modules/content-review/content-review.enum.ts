/**
 * 후기를 지금 저장할 수 없는 사유(`content-review-api.md` 4.1 `reason`). **판정 순서도 이 순서다** — 저장(4.2)의
 * 에러 순서(`CONTENT_REVIEW_DISABLED` → `CONTENT_WITHDRAWN` → `CONTENT_REVIEW_NOT_PLAYED`)와 같다.
 */
export enum ContentReviewUnreviewableReason {
  /** 후기 기능 스위치 꺼짐 */
  DISABLED = 'disabled',
  /** 회수 · 라이선스 만료 */
  WITHDRAWN = 'withdrawn',
  /** 재생을 시작한 적 없음 */
  NOT_PLAYED = 'not_played',
}

/** 프로모션 종류(domain.md 8.7 `promotions.kind`) — 지금은 한 값. 앱은 모르는 값이면 카드를 그리지 않는다 */
export enum PromotionKind {
  REVIEW_REWARD = 'review_reward',
}
