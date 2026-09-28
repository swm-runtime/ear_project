import { Content } from '@/modules/content/entities/content.entity';
import {
  DiscoveryExclusionReason,
  DiscoveryRanking,
  DurationPref,
  PreferenceSignalInput,
  ScoreBreakdown,
  ScoredCandidate,
  ScoringCandidate,
  UserPreferenceWeights,
} from '@/modules/drip/drip.types';

/**
 * 사용자 한 명의 편성 **계산 결과** — 적립(쓰기) 전 단계다.
 *
 * 배치(`DripBatchOrchestrator.scheduleForUser`)는 이걸 받아 적립·알림을 하고, 편성 미리보기
 * (`DripPreviewService`, admin 콘솔 "추천 검증")는 **같은 계산을 저장 없이** 받아 그대로 보인다.
 * 계산과 쓰기를 갈라 둔 이유가 그것이다 — 미리보기가 계산기를 따로 들고 있으면 스코어링이 바뀔 때마다
 * 둘이 어긋나는데, 어긋난 사실을 아무도 알 수 없다(결정 2026-09-18).
 */

/**
 * 4.1의 적립 스킵 사유. `null`이면 스킵 없이 편성 계산까지 갔다.
 * `already_placed` — 오늘 서비스 날짜에 이미 편성분(드립·탐험)이 있다. 중단된 배치를 재실행할 때
 * 같은 사용자에게 또 주지 않는 사용자 단위 멱등 판정이다(4.6-5, 2026-09-26).
 */
export type DripSkipReason =
  'no_interests' | 'already_placed' | 'unfinished_inventory' | 'plan_disabled';

export interface RegularPlan {
  /** SQL 필터를 통과한 후보 수(`SCORING_POOL_LIMIT` 상한) */
  poolSize: number;
  /** 시리즈 순서 게이트(`filterEpisodeOrder`)에서 빠진 후보 */
  gatedOut: ScoringCandidate[];
  /** 최근 편성분의 주제 — 편성 미리보기 표시용(노출 피로 항목은 2026-09-25 폐기, 스코어링 입력이 아니다) */
  recentDripTopicIds: string[];
  /** 게이트 통과 후보 전부, 점수 내림차순 */
  scored: ScoredCandidate[];
  /** 다양성 선정을 거친 최종 편성분(적립 순서) */
  picks: ScoredCandidate[];
}

export interface DiscoveryPlan {
  poolSize: number;
  /** content_id → 전 사용자 편성 이력 수 */
  exposureCounts: Map<string, number>;
  userRemovedTopicIds: string[];
  ranking: DiscoveryRanking;
  picks: ScoredCandidate[];
}

export interface UserDripPlan {
  userId: string;
  activeTopicIds: string[];
  skipReason: DripSkipReason | null;
  /** 오늘 서비스 날짜에 이미 편성된 항목 수(삭제분 포함) — `already_placed` 판정 입력 */
  placedTodayCount: number | null;
  unfinishedCount: number | null;
  dripCount: number | null;
  discoveryCount: number | null;
  /** 취향 캐시 계산 입력 — 최근 신호와 그 콘텐츠. 관심 0 스킵이면 비어 있다 */
  signals: PreferenceSignalInput[];
  signalContentsById: Map<string, Content>;
  completeSignalCount: number | null;
  isColdStart: boolean | null;
  preference: UserPreferenceWeights | null;
  difficultyAffinity: Record<string, number> | null;
  completedEpisodesBySeries: Map<string, number>;
  regular: RegularPlan | null;
  discovery: DiscoveryPlan | null;
  /** 탐험 계산이 던진 경우 — 정규 편성은 영향받지 않는다(4.8) */
  discoveryError: string | null;
}

export interface PlanOptions {
  /**
   * 취향 캐시(`user_preference_vectors`)를 저장할지. 배치는 저장하고(4.3), 미리보기는 계산만 한다 —
   * 미리보기가 캐시를 덮어쓰면 "지금 데이터로 계산하면"이 아니라 탐색 피드까지 바꾸는 쓰기가 된다.
   */
  persistPreference: boolean;
  /**
   * 스킵 사유가 나오면 거기서 멈출지. 배치는 멈추고(적립 규칙), 미리보기는 사유를 적은 채 끝까지 계산해
   * "스킵이 아니었다면 무엇이 갔을지"도 보인다.
   */
  stopAtSkip: boolean;
}

// ── 편성 미리보기(admin "추천 검증") — 서비스 계층의 결과 형태. HTTP 형상은 DTO가 snake_case로 옮긴다 ──

export interface DripPreviewTopicRef {
  topicId: string;
  /** 주제가 지워졌으면 null */
  name: string | null;
}

export interface DripPreviewContentRef {
  contentId: string;
  title: string;
}

export interface DripPreviewWeightEntry {
  key: string;
  name: string | null;
  weight: number;
}

/** 후보 한 편 — 콘텐츠 메타 + 스코어링 입력 + 점수 분해 + 선정 결과 */
export interface DripPreviewCandidateView {
  contentId: string;
  title: string;
  authorName: string | null;
  sourceName: string;
  durationSec: number;
  publishedAt: Date;
  difficulty: string | null;
  format: string | null;
  isEvergreen: boolean | null;
  seriesId: string | null;
  episodeNo: number | null;
  topics: DripPreviewTopicRef[];
  playCount: number;
  completeCount: number;
  hasEmbedding: boolean;
  score: number;
  isSeriesContinuation: boolean;
  breakdown: ScoreBreakdown;
  /** 최종 편성분이면 1부터의 순서, 아니면 null */
  pickOrder: number | null;
  /** 탐험 후보만 — 전 사용자 편성 이력 수 */
  exposureCount: number | null;
  /** 탐험 후보만 — 관심 주제와 교집합이 없는 "새 주제" 후보인가 */
  isOutsideInterests: boolean | null;
}

export interface DripPreviewView {
  computedAt: Date;
  serviceDate: string;
  user: {
    id: string;
    email: string | null;
    nickname: string | null;
    tier: string;
    jobCategory: string | null;
    yearsOfExperience: number | null;
    onboardingCompleted: boolean;
  };
  skipReason: DripSkipReason | null;
  unfinishedCount: number | null;
  unfinishedLimit: number;
  dripCount: number | null;
  discoveryCount: number | null;
  interests: (DripPreviewTopicRef & { source: string })[];
  removedTopics: DripPreviewTopicRef[];
  preference: {
    isColdStart: boolean | null;
    completeSignalCount: number | null;
    coldStartThreshold: number;
    signalCount: number | null;
    hasTasteEmbedding: boolean;
    durationPref: DurationPref | null;
    topicWeights: DripPreviewWeightEntry[];
    authorWeights: DripPreviewWeightEntry[];
    keywordWeights: DripPreviewWeightEntry[];
    formatWeights: DripPreviewWeightEntry[];
    difficultyAffinity: Record<string, number> | null;
  };
  signals: {
    contentId: string;
    title: string | null;
    action: string;
    createdAt: Date;
  }[];
  /** 스코어링 상수 — 화면이 가중치를 함께 보여 "이 항목이 얼마나 미는가"를 읽게 한다 */
  weights: {
    axes: { embedding: number; signal: number; meta: number };
    signalItems: Record<string, number>;
    metaItems: Record<string, number>;
    metaItemsColdStart: Record<string, number>;
    discoveryItems: Record<string, number>;
  };
  regular: {
    poolSize: number;
    gatedOut: (DripPreviewContentRef & { reason: 'episode_order' })[];
    recentDripTopics: DripPreviewTopicRef[];
    candidates: DripPreviewCandidateView[];
  } | null;
  discovery: {
    poolSize: number;
    qualityFloor: number;
    typicalCompleteRate: number;
    excluded: (DripPreviewContentRef & { reason: DiscoveryExclusionReason })[];
    candidates: DripPreviewCandidateView[];
  } | null;
  discoveryError: string | null;
  todayPlaced: DripPreviewContentRef[];
}
