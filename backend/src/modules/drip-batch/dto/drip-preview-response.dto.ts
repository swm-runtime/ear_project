import { ScoreBreakdown } from '@/modules/drip/drip.types';

import { DripPreviewCandidateView, DripPreviewView } from '../drip-batch.types';

/** 점수 분해 — 내부 형상(camelCase)을 API 규약(snake_case)으로 옮긴다. `null` = 입력 없어 축·항목에서 빠짐 */
interface ScoreBreakdownDto {
  embedding: number | null;
  signal: number | null;
  signal_items: {
    topic_preference: number | null;
    author_preference: number | null;
    keyword_match: number | null;
    format_preference: number | null;
    duration_closeness: number | null;
  } | null;
  meta: number | null;
  meta_items: {
    topic_match: number | null;
    freshness: number | null;
    popularity: number | null;
    difficulty_fit: number | null;
    career_fit: number | null;
    series_continuity: number | null;
    exposure_fatigue: number | null;
  };
}

interface TopicRefDto {
  topic_id: string;
  name: string | null;
}

interface CandidateDto {
  content_id: string;
  title: string;
  author_name: string | null;
  source_name: string;
  duration_sec: number;
  published_at: string;
  difficulty: string | null;
  format: string | null;
  is_evergreen: boolean | null;
  series_id: string | null;
  episode_no: number | null;
  topics: TopicRefDto[];
  play_count: number;
  complete_count: number;
  has_embedding: boolean;
  score: number;
  is_series_continuation: boolean;
  breakdown: ScoreBreakdownDto;
  pick_order: number | null;
  exposure_count: number | null;
  is_outside_interests: boolean | null;
}

/**
 * 편성 미리보기 응답 — `GET /admin/drip/preview`. 읽기 전용이며 서버 상태를 바꾸지 않는다.
 * 점수는 계산 그대로(반올림하지 않음) 싣고, 화면이 표시 자릿수를 정한다.
 */
export class DripPreviewResponseDto {
  readonly computed_at: string;
  readonly service_date: string;
  readonly user: {
    id: string;
    email: string | null;
    nickname: string | null;
    tier: string;
    job_category: string | null;
    years_of_experience: number | null;
    onboarding_completed: boolean;
  };
  readonly skip_reason: string | null;
  readonly unfinished_count: number | null;
  readonly unfinished_limit: number;
  readonly drip_count: number | null;
  readonly discovery_count: number | null;
  readonly interests: (TopicRefDto & { source: string })[];
  readonly removed_topics: TopicRefDto[];
  readonly preference: {
    is_cold_start: boolean | null;
    complete_signal_count: number | null;
    cold_start_threshold: number;
    signal_count: number | null;
    has_taste_embedding: boolean;
    duration_pref: {
      median_sec: number;
      p25_sec: number;
      p75_sec: number;
    } | null;
    topic_weights: { key: string; name: string | null; weight: number }[];
    author_weights: { key: string; name: string | null; weight: number }[];
    keyword_weights: { key: string; name: string | null; weight: number }[];
    format_weights: { key: string; name: string | null; weight: number }[];
    difficulty_affinity: Record<string, number> | null;
  };
  readonly signals: {
    content_id: string;
    title: string | null;
    action: string;
    created_at: string;
  }[];
  readonly weights: {
    axes: { embedding: number; signal: number; meta: number };
    signal_items: Record<string, number>;
    meta_items: Record<string, number>;
    meta_items_cold_start: Record<string, number>;
    discovery_items: Record<string, number>;
  };
  readonly regular: {
    pool_size: number;
    gated_out: { content_id: string; title: string; reason: string }[];
    recent_drip_topics: TopicRefDto[];
    candidates: CandidateDto[];
  } | null;
  readonly discovery: {
    pool_size: number;
    quality_floor: number;
    typical_complete_rate: number;
    excluded: { content_id: string; title: string; reason: string }[];
    candidates: CandidateDto[];
  } | null;
  readonly discovery_error: string | null;
  readonly today_placed: { content_id: string; title: string }[];

  static from(view: DripPreviewView): DripPreviewResponseDto {
    return {
      computed_at: view.computedAt.toISOString(),
      service_date: view.serviceDate,
      user: {
        id: view.user.id,
        email: view.user.email,
        nickname: view.user.nickname,
        tier: view.user.tier,
        job_category: view.user.jobCategory,
        years_of_experience: view.user.yearsOfExperience,
        onboarding_completed: view.user.onboardingCompleted,
      },
      skip_reason: view.skipReason,
      unfinished_count: view.unfinishedCount,
      unfinished_limit: view.unfinishedLimit,
      drip_count: view.dripCount,
      discovery_count: view.discoveryCount,
      interests: view.interests.map((interest) => ({
        topic_id: interest.topicId,
        name: interest.name,
        source: interest.source,
      })),
      removed_topics: view.removedTopics.map(toTopicRef),
      preference: {
        is_cold_start: view.preference.isColdStart,
        complete_signal_count: view.preference.completeSignalCount,
        cold_start_threshold: view.preference.coldStartThreshold,
        signal_count: view.preference.signalCount,
        has_taste_embedding: view.preference.hasTasteEmbedding,
        duration_pref: view.preference.durationPref,
        topic_weights: view.preference.topicWeights,
        author_weights: view.preference.authorWeights,
        keyword_weights: view.preference.keywordWeights,
        format_weights: view.preference.formatWeights,
        difficulty_affinity: view.preference.difficultyAffinity,
      },
      signals: view.signals.map((signal) => ({
        content_id: signal.contentId,
        title: signal.title,
        action: signal.action,
        created_at: signal.createdAt.toISOString(),
      })),
      weights: {
        axes: view.weights.axes,
        signal_items: snakeKeys(view.weights.signalItems),
        meta_items: snakeKeys(view.weights.metaItems),
        meta_items_cold_start: snakeKeys(view.weights.metaItemsColdStart),
        discovery_items: snakeKeys(view.weights.discoveryItems),
      },
      regular:
        view.regular === null
          ? null
          : {
              pool_size: view.regular.poolSize,
              gated_out: view.regular.gatedOut.map((entry) => ({
                content_id: entry.contentId,
                title: entry.title,
                reason: entry.reason,
              })),
              recent_drip_topics: view.regular.recentDripTopics.map(toTopicRef),
              candidates: view.regular.candidates.map(toCandidateDto),
            },
      discovery:
        view.discovery === null
          ? null
          : {
              pool_size: view.discovery.poolSize,
              quality_floor: view.discovery.qualityFloor,
              typical_complete_rate: view.discovery.typicalCompleteRate,
              excluded: view.discovery.excluded.map((entry) => ({
                content_id: entry.contentId,
                title: entry.title,
                reason: entry.reason,
              })),
              candidates: view.discovery.candidates.map(toCandidateDto),
            },
      discovery_error: view.discoveryError,
      today_placed: view.todayPlaced.map((entry) => ({
        content_id: entry.contentId,
        title: entry.title,
      })),
    };
  }
}

function toTopicRef(ref: {
  topicId: string;
  name: string | null;
}): TopicRefDto {
  return { topic_id: ref.topicId, name: ref.name };
}

function toCandidateDto(candidate: DripPreviewCandidateView): CandidateDto {
  return {
    content_id: candidate.contentId,
    title: candidate.title,
    author_name: candidate.authorName,
    source_name: candidate.sourceName,
    duration_sec: candidate.durationSec,
    published_at: candidate.publishedAt.toISOString(),
    difficulty: candidate.difficulty,
    format: candidate.format,
    is_evergreen: candidate.isEvergreen,
    series_id: candidate.seriesId,
    episode_no: candidate.episodeNo,
    topics: candidate.topics.map(toTopicRef),
    play_count: candidate.playCount,
    complete_count: candidate.completeCount,
    has_embedding: candidate.hasEmbedding,
    score: candidate.score,
    is_series_continuation: candidate.isSeriesContinuation,
    breakdown: toBreakdownDto(candidate.breakdown),
    pick_order: candidate.pickOrder,
    exposure_count: candidate.exposureCount,
    is_outside_interests: candidate.isOutsideInterests,
  };
}

function toBreakdownDto(breakdown: ScoreBreakdown): ScoreBreakdownDto {
  return {
    embedding: breakdown.embedding,
    signal: breakdown.signal,
    signal_items:
      breakdown.signalItems === null
        ? null
        : {
            topic_preference: breakdown.signalItems.topicPreference,
            author_preference: breakdown.signalItems.authorPreference,
            keyword_match: breakdown.signalItems.keywordMatch,
            format_preference: breakdown.signalItems.formatPreference,
            duration_closeness: breakdown.signalItems.durationCloseness,
          },
    meta: breakdown.meta,
    meta_items: {
      topic_match: breakdown.metaItems.topicMatch,
      freshness: breakdown.metaItems.freshness,
      popularity: breakdown.metaItems.popularity,
      difficulty_fit: breakdown.metaItems.difficultyFit,
      career_fit: breakdown.metaItems.careerFit,
      series_continuity: breakdown.metaItems.seriesContinuity,
      exposure_fatigue: breakdown.metaItems.exposureFatigue,
    },
  };
}

/** 상수 객체의 camelCase 키를 snake_case로 — 가중치 표는 키가 곧 항목 이름이다 */
function snakeKeys(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`),
      value,
    ]),
  );
}
