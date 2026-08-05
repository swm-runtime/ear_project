/**
 * domain.md 5.1 — `status`는 **3값만** 갖는다(A-6).
 * 파이프라인 상태(`draft` / `partner_review` / `qa_failed` 등)는 존재하지 않는다.
 * 업로드 = 발행이며, **노출 조건은 어디서나 `published` 하나로 통일한다.**
 */
export enum ContentStatus {
  PUBLISHED = 'published',
  WITHDRAWN = 'withdrawn',
  EXPIRED = 'expired',
}

export enum ContentOrigin {
  PARTNER = 'partner',
  AI_GENERATED = 'ai_generated',
}

/** domain.md 5.4 */
export enum StatsPeriodType {
  WEEK = 'week',
  MONTH = 'month',
  ALL = 'all',
}

/** `period_type = all`의 `period_start` 고정값. NULL로 두면 유니크가 중복을 막지 못한다 */
export const ALL_TIME_PERIOD_START = '1970-01-01';
