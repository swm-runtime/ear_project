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
  /**
   * 대본 임베딩(`content_embeddings` — 현재 모델·현재 버전 행만). null이면 임베딩 축이
   * 빠지고(4.2 재정규화) 다양성 판정은 이산 규칙으로 폴백한다(4.2-3).
   */
  embedding: number[] | null;
}

/**
 * 최종 점수가 **어떻게 나왔는지**. 편성 결과를 사후에 되짚기 위한 값이다.
 *
 * 점수 하나만 남기면 "이 사용자에게 왜 이 콘텐츠가 갔나"에 답할 수 없다. 실제로
 * 인기도 축이 상수 0인 것(`content_stats` 미집계)과 탐험 풀이 뒤집혀 있던 것을,
 * 코드를 읽기 전까지 아무도 몰랐다 — **입력이 죽어 있어도 점수는 나오기 때문이다.**
 *
 * `null`은 **입력이 없어 축에서 빠졌다**는 뜻이다(4.2 재정규화). 0과 다르다.
 */
export interface ScoreBreakdown {
  /** 축별 점수 — 임베딩 유사도 · 신호 선호도 · 메타 규칙 */
  embedding: number | null;
  signal: number | null;
  meta: number | null;
  /**
   * 신호 선호 축 안의 항목별 점수(4.2 ②). 축이 빠졌으면(콜드스타트·취향 없음) null.
   * 항목 하나가 null이면 그 항목의 입력이 없어 축에서 빠진 것이다(메타 항목과 같은 규칙).
   */
  signalItems: {
    topicPreference: number | null;
    authorPreference: number | null;
    keywordMatch: number | null;
    formatPreference: number | null;
    durationCloseness: number | null;
  } | null;
  /** 메타 축 안의 항목별 점수(4.2 ③) */
  metaItems: {
    topicMatch: number | null;
    freshness: number | null;
    popularity: number | null;
    difficultyFit: number | null;
    /** 커리어 적합도(4.2 ③) — 콘텐츠 청자 세트와 사용자 직군·연차 대조. 어느 쪽이든 없으면 null */
    careerFit: number | null;
    seriesContinuity: number | null;
    /**
     * 정규 편성에서는 **항상 null** — 노출 피로 항목은 폐기됐다(2026-09-25, `META_ITEM_WEIGHTS` 주석).
     * 탐험 편성은 이 자리에 저노출 가점(`1/(1+노출수)`)을 싣는다. 필드를 남기는 것은 편성 미리보기 응답
     * (`exposure_fatigue`)을 어드민 웹이 읽기 때문이다.
     */
    exposureFatigue: number | null;
  };
}

/** 사용자 커리어 — 커리어 적합도의 입력(`users.job_category` · `years_of_experience`) */
export interface UserCareer {
  jobCategory: string | null;
  /** 구간 하한값(0·2·4·7) — `YEARS_OF_EXPERIENCE_LOWER_BOUND` */
  yearsOfExperience: number | null;
}

export interface ScoredCandidate extends ScoringCandidate {
  score: number;
  /** 시리즈 연속 편 여부 — 다양성 제약의 예외 판정에 쓴다(`drip-scheduling.md` 4.2-3) */
  isSeriesContinuation: boolean;
  breakdown: ScoreBreakdown;
}

/** 정규 편성 스코어링 문맥(`drip-scheduling.md` 4.2) */
export interface RegularScoringContext {
  activeTopicIds: string[];
  preference: UserPreferenceWeights | null;
  /** 완청 이력의 난이도 분포(0~1 비중) — 콜드스타트가 아닐 때의 난이도 적합도 입력 */
  difficultyAffinity: Record<string, number> | null;
  /** series_id → 완청 최대 episode_no */
  completedEpisodesBySeries: Map<string, number>;
  /** 완청 3건 미만(`drip-scheduling.md` 4.4) */
  isColdStart: boolean;
  /** 커리어 적합도 입력 — 프로필이라 콜드스타트에서도 살아 있는 항목이다 */
  career: UserCareer | null;
  now: Date;
}

/** 취향 가중치 — `UserPreferenceVector`의 계산 결과 형태 */
export interface UserPreferenceWeights {
  topicWeights: Record<string, number>;
  authorWeights: Record<string, number>;
  keywordWeights: Record<string, number>;
  formatWeights: Record<string, number>;
  durationPref: DurationPref | null;
  /** 취향 벡터(4.3-1) — 긍정 신호 콘텐츠에 임베딩이 하나도 없으면 null(임베딩 축 제외) */
  tasteEmbedding: number[] | null;
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
  /**
   * 정규 편성으로 이미 뽑힌 편의 임베딩 — 탐험 편도 MMR 비교 대상에 포함한다
   * (`drip-scheduling.md` 4.2-3). 생략하면 이산 규칙만으로 동작한다.
   */
  pickedEmbeddings?: number[][];
  count: number;
  now: Date;
}

/** 탐험 후보가 선정 전에 빠진 이유(4.8) — 미리보기가 "왜 후보가 아니었나"를 보이기 위한 값 */
export type DiscoveryExclusionReason =
  'user_removed_topic' | 'below_quality_floor';

/**
 * 탐험 후보 전체의 순위 — `selectDiscovery`가 뽑기 전에 만드는 중간 결과를 그대로 공개한다.
 * 배치는 `picks`만 쓰고, 편성 미리보기(admin)는 후보 전부의 점수와 제외 사유를 보인다.
 */
export interface DiscoveryRanking {
  /** 이 풀에 적용된 품질 하한 — `min(절대 하한, 전형 완청률 × 비율)` */
  qualityFloor: number;
  /** 후보별 스무딩 완청률의 단순 평균 */
  typicalCompleteRate: number;
  /** 하한·해제 주제를 통과한 후보, 탐험 점수 내림차순 */
  scored: ScoredCandidate[];
  excluded: { candidate: ScoringCandidate; reason: DiscoveryExclusionReason }[];
}
