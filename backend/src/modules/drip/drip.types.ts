import { Content } from '@/modules/content/entities/content.entity';

import { FirstDripJobStatus, PreferenceSignalAction } from './drip.enum';

/** convention.md 3.2 — 모듈 밖으로 공개되는 타입만 둔다 */

/** onboarding-api.md 4.8 — 첫 드립 편성 상태 */
export interface FirstDripState {
  status: FirstDripJobStatus;
  /** 적립은 원자적이라 `completed`면 이 값이 편성된 전량이다 */
  itemCount: number;
  completedAt: Date | null;
}

/**
 * domain.md 7.2 `duration_pref` — jsonb 내부 키는 DB 쪽 형상이라 snake_case를 유지한다
 * (convention.md 1.6의 변환 경계는 DTO이지 jsonb 내용이 아니다).
 */
export interface DurationPref {
  median_sec: number;
  p25_sec: number;
  p75_sec: number;
}

/** 신호 집계 입력 — 원천(`user_signals`)의 소유자는 playback이므로 조립해서 받는다 */
export interface PreferenceSignalInput {
  contentId: string;
  action: PreferenceSignalAction;
  createdAt: Date;
}

/** 스코어링 후보 — 콘텐츠에 스코어링 입력(집계·주제)을 붙인 형태 */
export interface ScoringCandidate {
  content: Content;
  playCount: number;
  completeCount: number;
  topicIds: string[];
}

export interface ScoredCandidate extends ScoringCandidate {
  score: number;
  /** 시리즈 연속 편 여부 — 다양성 제약의 예외 판정에 쓴다(`drip-scheduling.md` 4.2-3) */
  isSeriesContinuation: boolean;
}

/** 정규 편성 스코어링 문맥(`drip-scheduling.md` 4.2) */
export interface RegularScoringContext {
  activeTopicIds: string[];
  preference: UserPreferenceWeights | null;
  /** 완청 이력의 난이도 분포(0~1 비중) — 콜드스타트가 아닐 때의 난이도 적합도 입력 */
  difficultyAffinity: Record<string, number> | null;
  /** series_id → 완청 최대 episode_no */
  completedEpisodesBySeries: Map<string, number>;
  /** 최근 편성분의 주제 — 노출 피로 감점 */
  recentDripTopicIds: string[];
  /** 완청 3건 미만(`drip-scheduling.md` 4.4) */
  isColdStart: boolean;
  now: Date;
}

/** 취향 가중치 — `UserPreferenceVector`의 계산 결과 형태 */
export interface UserPreferenceWeights {
  topicWeights: Record<string, number>;
  authorWeights: Record<string, number>;
  keywordWeights: Record<string, number>;
  formatWeights: Record<string, number>;
  durationPref: DurationPref | null;
  signalCount: number;
}

/** 탐험 편성 선정 입력(`drip-scheduling.md` 4.8) */
export interface DiscoverySelectionInput {
  candidates: ScoringCandidate[];
  /** content_id → 전 사용자 편성 이력 수 (저노출 판정) */
  exposureCounts: Map<string, number>;
  activeTopicIds: string[];
  /** 사용자가 직접 해제한 주제 — 후보 제외 */
  userRemovedTopicIds: string[];
  /** 정규 편성으로 이미 뽑힌 편의 주제 — 이산 다양성 회피 */
  pickedTopicIds: string[];
  count: number;
  now: Date;
}
