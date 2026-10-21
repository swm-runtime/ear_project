import {
  CandidateDto,
  TopicRefDto,
  snakeKeys,
  toCandidateDto,
  toTopicRef,
} from '@/modules/drip-batch/dto/drip-preview-response.dto';
import {
  DripExplainView,
  DripPreviewCandidateView,
} from '@/modules/drip-batch/drip-batch.types';
import { toServiceDate } from '@/common/utils/service-date.util';
import { SCORING_POOL_LIMIT } from '@/modules/drip/drip.constant';

import {
  INSPECTOR_EXPLANATION_NOTICE,
  INSPECTOR_EXPLANATION_TOP_N,
} from '../recommend-inspector.constant';
import { InspectorDetail } from '../recommend-inspector.service';
import { InspectorTopicRef } from '../recommend-inspector.types';

type ExplanationDto = ReturnType<typeof toExplanationDto>;

/** 후보 표 한 줄 — 편성 미리보기의 후보(점수 분해 포함)에 순위와 "편성될 편인가"를 붙인다 */
type RankedCandidateDto = CandidateDto & { rank: number; would_place: boolean };

/**
 * 후보 SQL 이 거는 조건(`ContentRepository.findCandidates`) — 화면이 "어떤 필터를 지나 남은 풀인가"를 글로 보인다.
 * 계산에 쓰이지 않는 설명값이다. 조건이 바뀌면 여기도 고친다.
 */
const REGULAR_SQL_FILTERS = [
  '노출 중(발행·라이선스 유효)이고 사용자 시장의 콘텐츠',
  '관심 주제(자동 슬롯 판정 반영 뒤) 중 하나 이상에 속함',
  '라이브러리에 있었던 콘텐츠(삭제분 포함)·영구 제외 콘텐츠 제외',
  `인기·신선도 순 상위 ${SCORING_POOL_LIMIT}편`,
];
const DISCOVERY_SQL_FILTERS = [
  '노출 중(발행·라이선스 유효)이고 사용자 시장의 콘텐츠 — 관심 주제 조건 없음',
  '라이브러리에 있었던 콘텐츠(삭제분 포함)·영구 제외 콘텐츠·오늘 정규 편성분 제외',
  '시리즈는 도입부(1화)만',
  `저노출 순 상위 ${SCORING_POOL_LIMIT}편`,
];

/**
 * 추천 검증 상세 — `GET /admin/insights/recommendations/users/:userId`.
 *
 * 사용자는 `user_id`로만 가리킨다. **이메일·닉네임·제공자 ID·프로필 사진·직함은 이 형상에 칸이 없다.** `explanation`은
 * 지금 데이터로 다시 계산한 값이다(점수는 저장되지 않는다 — `domain.md` 6.1·7.2) — `notice`가 그 사실을 함께 싣는다.
 */
export class RecommendInspectorDetailResponseDto {
  readonly user_id: string;
  readonly generated_at: string;
  readonly profile: {
    tier: string;
    market: string;
    signed_up_at: string;
    onboarding_completed: boolean;
    onboarding_step: string;
    onboarding_completed_at: string | null;
    /** 커리어 적합도 입력 — KR 시장에서만 편성이 쓴다(`career_used`) */
    job_category: string | null;
    years_of_experience: number | null;
    career_used: boolean;
    is_auto_expand_enabled: boolean;
  };
  readonly interests: {
    topic_id: string;
    name: string | null;
    source: string;
    is_active: boolean;
    is_user_removed: boolean;
    is_topic_visible: boolean | null;
    added_at: string;
    deactivated_at: string | null;
  }[];
  readonly listening: {
    since: string;
    items: {
      content_id: string;
      title: string;
      topics: TopicRefDto[];
      duration_sec: number;
      first_played_at: string | null;
      last_played_at: string | null;
      play_days: number;
      listen_sec: number;
      complete_count: number;
      last_completed_at: string | null;
      saved_at: string | null;
      max_reached_sec: number | null;
      /** 도달 위치 / 길이(0~1). 진행 행이 없으면 null */
      listened_ratio: number | null;
    }[];
  };
  readonly deliveries: {
    since: string;
    items: {
      service_date: string;
      added_at: string;
      content_id: string;
      title: string;
      topics: TopicRefDto[];
      source: string;
      algorithm_version: string | null;
      status: string;
      deleted: boolean;
      played_after: boolean;
      completed_after: boolean;
      feedback_stars: number | null;
    }[];
  };
  readonly explanation: ExplanationDto;

  static from(
    detail: InspectorDetail,
    now: Date,
  ): RecommendInspectorDetailResponseDto {
    const { profile, explanation } = detail;

    return {
      user_id: profile.userId,
      generated_at: now.toISOString(),
      profile: {
        tier: profile.tier,
        market: profile.market,
        signed_up_at: profile.signedUpAt.toISOString(),
        onboarding_completed: profile.onboardingCompleted,
        onboarding_step: profile.onboardingStep,
        onboarding_completed_at:
          profile.onboardingCompletedAt?.toISOString() ?? null,
        job_category: profile.jobCategory,
        years_of_experience: profile.yearsOfExperience,
        // scoringCareerOf 와 같은 판정 — KR 시장만 커리어 적합도를 쓴다
        career_used: profile.market === 'kr',
        is_auto_expand_enabled: profile.isAutoExpandEnabled,
      },
      interests: detail.interests.map((i) => ({
        topic_id: i.topicId,
        name: i.name,
        source: i.source,
        is_active: i.isActive,
        is_user_removed: i.isUserRemoved,
        is_topic_visible: i.isTopicVisible,
        added_at: i.addedAt.toISOString(),
        deactivated_at: i.deactivatedAt?.toISOString() ?? null,
      })),
      listening: {
        since: detail.listening.since.toISOString(),
        items: detail.listening.items.map((l) => ({
          content_id: l.contentId,
          title: l.title,
          topics: l.topics.map(toRef),
          duration_sec: l.durationSec,
          first_played_at: l.firstPlayedAt?.toISOString() ?? null,
          last_played_at: l.lastPlayedAt?.toISOString() ?? null,
          play_days: l.playDays,
          listen_sec: l.listenSec,
          complete_count: l.completeCount,
          last_completed_at: l.lastCompletedAt?.toISOString() ?? null,
          saved_at: l.savedAt?.toISOString() ?? null,
          max_reached_sec: l.maxReachedSec,
          listened_ratio:
            l.maxReachedSec === null || l.durationSec <= 0
              ? null
              : Math.min(1, l.maxReachedSec / l.durationSec),
        })),
      },
      deliveries: {
        since: detail.deliveries.since.toISOString(),
        items: detail.deliveries.items.map((d) => ({
          service_date: toServiceDate(d.addedAt),
          added_at: d.addedAt.toISOString(),
          content_id: d.contentId,
          title: d.title,
          topics: d.topics.map(toRef),
          source: d.source,
          algorithm_version: d.algorithmVersion,
          status: d.status,
          deleted: d.deletedAt !== null,
          played_after: d.playedAfter,
          completed_after: d.completedAfter,
          feedback_stars: d.feedbackStars,
        })),
      },
      explanation: toExplanationDto(
        explanation.view,
        explanation.signalTopicCounts,
        explanation.exclusionSources,
      ),
    };
  }
}

function toRef(ref: InspectorTopicRef): TopicRefDto {
  return { topic_id: ref.topicId, name: ref.name };
}

function rankTop(candidates: DripPreviewCandidateView[]): RankedCandidateDto[] {
  // 후보는 이미 점수 내림차순이다(편성 계산 그대로). 순위는 그 순서, 편성 여부는 최종 선정(다양성 반영)에 들었는가
  return candidates.slice(0, INSPECTOR_EXPLANATION_TOP_N).map((c, index) => ({
    ...toCandidateDto(c),
    rank: index + 1,
    would_place: c.pickOrder !== null,
  }));
}

function picksOf(candidates: DripPreviewCandidateView[]) {
  // 선정은 다양성 규칙을 거치므로 점수 상위 N 밖에서 뽑힐 수 있다 — 표 길이와 무관하게 전부 싣는다
  return candidates
    .filter((c) => c.pickOrder !== null)
    .sort((a, b) => (a.pickOrder ?? 0) - (b.pickOrder ?? 0))
    .map((c) => ({
      pick_order: c.pickOrder,
      content_id: c.contentId,
      title: c.title,
      score: c.score,
      rank: candidates.indexOf(c) + 1,
      is_series_continuation: c.isSeriesContinuation,
      is_outside_interests: c.isOutsideInterests,
    }));
}

function countBy<T extends string>(reasons: T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const reason of reasons) {
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return counts;
}

function toExplanationDto(
  view: DripExplainView,
  signalTopicCounts: InspectorDetail['explanation']['signalTopicCounts'],
  exclusionSources: InspectorDetail['explanation']['exclusionSources'],
) {
  const regular = view.regular;
  const discovery = view.discovery;

  return {
    notice: INSPECTOR_EXPLANATION_NOTICE,
    computed_at: view.computedAt.toISOString(),
    service_date: view.serviceDate,
    skip_reason: view.skipReason,
    unfinished_count: view.unfinishedCount,
    unfinished_limit: view.unfinishedLimit,
    drip_count: view.dripCount,
    discovery_count: view.discoveryCount,
    weights: {
      axes: view.weights.axes,
      signal_items: snakeKeys(view.weights.signalItems),
      meta_items: snakeKeys(view.weights.metaItems),
      meta_items_cold_start: snakeKeys(view.weights.metaItemsColdStart),
      discovery_items: snakeKeys(view.weights.discoveryItems),
    },
    preference: {
      is_cold_start: view.preference.isColdStart,
      complete_signal_count: view.preference.completeSignalCount,
      cold_start_threshold: view.preference.coldStartThreshold,
      signal_count: view.preference.signalCount,
      has_taste_embedding: view.preference.hasTasteEmbedding,
      duration_pref: view.preference.durationPref,
      topic_weights: view.preference.topicWeights,
      keyword_weights: view.preference.keywordWeights,
      format_weights: view.preference.formatWeights,
      author_weights: view.preference.authorWeights,
      difficulty_affinity: view.preference.difficultyAffinity,
      signal_total: view.signals.length,
      signal_actions: countBy(view.signals.map((s) => s.action)),
      signal_counts_by_topic: signalTopicCounts.map((t) => ({
        topic_id: t.topicId,
        name: t.name,
        counts: t.counts,
        total: t.total,
      })),
    },
    auto_expand:
      view.autoExpand === null
        ? null
        : {
            action: view.autoExpand.action,
            reason: view.autoExpand.reason,
            add_topic: view.autoExpand.addTopic
              ? toTopicRef(view.autoExpand.addTopic)
              : null,
            remove_topic: view.autoExpand.removeTopic
              ? toTopicRef(view.autoExpand.removeTopic)
              : null,
            candidates: view.autoExpand.candidates.map((c) => ({
              ...toTopicRef(c),
              completes: c.completes,
              weight: c.weight,
            })),
          },
    exclusion_sources: {
      library_contents: exclusionSources.libraryContents,
      permanently_excluded: exclusionSources.permanentlyExcluded,
    },
    regular:
      regular === null
        ? null
        : {
            pool_size: regular.poolSize,
            sql_filters: REGULAR_SQL_FILTERS,
            excluded_counts: countBy(regular.gatedOut.map((g) => g.reason)),
            candidate_count: regular.candidates.length,
            series: {
              gated_out: regular.gatedOut.map((g) => ({
                content_id: g.contentId,
                title: g.title,
                reason: g.reason,
              })),
              continuation_count: regular.candidates.filter(
                (c) => c.isSeriesContinuation,
              ).length,
            },
            top: rankTop(regular.candidates),
            picks: picksOf(regular.candidates),
          },
    discovery:
      discovery === null
        ? null
        : {
            pool_size: discovery.poolSize,
            sql_filters: DISCOVERY_SQL_FILTERS,
            quality_floor: discovery.qualityFloor,
            typical_complete_rate: discovery.typicalCompleteRate,
            excluded_counts: countBy(discovery.excluded.map((e) => e.reason)),
            candidate_count: discovery.candidates.length,
            top: rankTop(discovery.candidates),
            picks: picksOf(discovery.candidates),
          },
    discovery_error: view.discoveryError,
    today_placed: view.todayPlaced.map((t) => ({
      content_id: t.contentId,
      title: t.title,
    })),
  };
}
