/** convention.md 3.2 — 모듈 밖으로 공개되는 타입만 둔다 */

/** 추천·편성 후보 조회 조건 */
export interface ContentCandidateQuery {
  /** 이 주제 중 하나라도 걸리는 콘텐츠만. 비우면 주제 조건을 적용하지 않는다 */
  includeTopicIds?: string[];
  /** 이 주제에 걸리는 콘텐츠는 제외한다 (관심 주제 밖에서 뽑을 때) */
  excludeTopicIds?: string[];
  excludeContentIds?: string[];
  /**
   * 시리즈 중간 편을 후보에서 뺀다(`episode_no`가 없거나 1인 것만).
   * 1편을 듣지 않은 사용자에게 3편을 적립하지 않기 위한 조건이다
   * (`drip-scheduling.md` 7).
   */
  seriesStartOnly?: boolean;
  limit: number;
  now: Date;
}

/** 콘텐츠에 붙은 주제 — 클라이언트가 주제 배지를 그리는 데 쓴다 */
export interface ContentTopicView {
  contentId: string;
  topicId: string;
  name: string;
}
