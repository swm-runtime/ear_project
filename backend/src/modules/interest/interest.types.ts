/** convention.md 3.2 — 모듈 밖으로 공개되는 타입만 둔다 */

/** onboarding-api.md 4.2 — 주제 목록 조회 결과 */
export interface TopicListResult {
  topics: TopicView[];
  maxSelectable: number;
  /**
   * 관리자가 설정한 노출 주제가 없어 폴백 세트를 내려보낸 상태.
   * **정상 상태가 아니며 서버가 운영 알림을 발생시킨다**(onboarding.md 7).
   */
  isFallback: boolean;
}

export interface TopicView {
  topicId: string;
  name: string;
  parentCategory: string;
}
