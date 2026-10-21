/**
 * 추천 검증 — 서비스 계층의 결과 형태. HTTP 형상은 DTO 가 snake_case 로 옮긴다.
 *
 * **이메일·닉네임·제공자 ID·프로필 사진은 어떤 형태에도 없다.** 사용자는 `userId`로만 가리킨다.
 */

export type InspectorUserSort = 'listen' | 'recent';

export interface InspectorUserRow {
  userId: string;
  tier: string;
  signedUpAt: Date;
  market: string;
  interestCount: number;
  plays30d: number;
  listenSec30d: number;
  completes30d: number;
  lastPlayedAt: Date | null;
}

/** 편성 계산이 읽는 필드 + 화면 프로필. 이메일·닉네임 컬럼은 조회하지 않는다 */
export interface InspectorProfileRow {
  userId: string;
  tier: string;
  market: string;
  signedUpAt: Date;
  onboardingCompleted: boolean;
  onboardingStep: string;
  onboardingCompletedAt: Date | null;
  /** 커리어 적합도(drip-scheduling 4.2 ③) 입력 — KR 시장에서만 쓴다 */
  jobCategory: string | null;
  yearsOfExperience: number | null;
  /** `user_settings.is_auto_expand_enabled` — 행이 없으면 기본값 true(`UserSettingService.getSettings`) */
  isAutoExpandEnabled: boolean;
}

export interface InspectorInterestRow {
  topicId: string;
  name: string | null;
  source: string;
  isActive: boolean;
  isUserRemoved: boolean;
  isTopicVisible: boolean | null;
  /** 자동 슬롯은 `updated_at`(활성화 시각 — domain.md 4.2), 그 밖은 `created_at` */
  addedAt: Date;
  deactivatedAt: Date | null;
}

export interface InspectorTopicRef {
  topicId: string;
  name: string;
}

export interface InspectorListeningRow {
  contentId: string;
  title: string;
  durationSec: number;
  topics: InspectorTopicRef[];
  firstPlayedAt: Date | null;
  lastPlayedAt: Date | null;
  playDays: number;
  listenSec: number;
  completeCount: number;
  lastCompletedAt: Date | null;
  savedAt: Date | null;
  maxReachedSec: number | null;
}

export interface InspectorDeliveryRow {
  contentId: string;
  title: string;
  topics: InspectorTopicRef[];
  source: string;
  algorithmVersion: string | null;
  addedAt: Date;
  status: string;
  deletedAt: Date | null;
  playedAfter: boolean;
  completedAfter: boolean;
  feedbackStars: number | null;
}

export interface InspectorSignalTopicCount {
  topicId: string;
  name: string | null;
  counts: Record<string, number>;
  total: number;
}
