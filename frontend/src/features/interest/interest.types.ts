/** 주제 목록 항목 — 온보딩 1단계와 같은 계약이다(onboarding-api.md 4.2 공용 참조) */
export interface TopicItem {
  topicId: string;
  /**
   * 시장 무관 안정 키 — 주제 사진 매핑 키다(global-api.md 4.5, KAN-195). KR 주제는 서버 입력(BE KAN-212) 전까지
   * `null`이고 그동안 사진은 이름으로 찾는다(interest.images.ts)
   */
  slug: string | null;
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
  /*
   * `is_fallback`은 모델에 담지 않는다. 서버가 기본 주제 세트 폴백을 없앤 뒤로 값이 항상
   * false라, 모델에 두면 언젠가 누군가 늘 거짓인 조건으로 분기를 만든다. 계약 필드 자체는
   * 유지돼 있으므로(onboarding-api.md 4.2) DTO에는 그대로 선언해 둔다.
   */
}

/**
 * user_interests.source 원값(domain.md 4.2) — 구분 매핑은 화면이 한다(KAN-181).
 * auto_expand → 버블에 빗금(애플식 "창문 블라인드") 오버레이로 구분하고, "N/3" 집계·저장 게이트에서
 * 자동 슬롯을 뺀다(interest-management-api.md 4.2, drip-scheduling.md 4.5-1).
 */
export type InterestSource = 'onboarding' | 'manual' | 'auto_expand';

/** 현재 활성이면서 노출 중인 주제의 관심사 — 순서는 의미가 없다(칩 배치는 주제 목록이 정한다) */
export interface UserInterest {
  topicId: string;
  source: InterestSource;
}
