/** 주제 목록 항목 — 온보딩 1단계와 같은 계약이다(onboarding-api.md 4.2 공용 참조) */
export interface TopicItem {
  topicId: string;
  name: string;
  parentCategory: string;
}

/**
 * GET /onboarding/topics 응답. "N/3"의 분모(maxSelectable)는 서버가 내려준다 —
 * 클라이언트에 상수로 두지 않는다(interest-management-api.md 4.1).
 */
export interface TopicList {
  items: TopicItem[];
  maxSelectable: number;
  isFallback: boolean;
}

/**
 * user_interests.source 원값(domain.md 4.2) — 배지 매핑은 화면이 한다.
 * auto_expand → "자동 추가됨" 배지는 P1이라 MVP 화면은 이 값을 읽지 않는다(interest-management-api.md 4.2).
 */
export type InterestSource = 'onboarding' | 'manual' | 'auto_expand';

/** 현재 활성이면서 노출 중인 주제의 관심사 — 순서는 의미가 없다(칩 배치는 주제 목록이 정한다) */
export interface UserInterest {
  topicId: string;
  source: InterestSource;
}
