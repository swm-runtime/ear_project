import { HttpStatus, Injectable } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import {
  toServiceDate,
  toServiceDayRange,
} from '@/common/utils/service-date.util';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import {
  AXIS_WEIGHT_EMBEDDING,
  AXIS_WEIGHT_META,
  AXIS_WEIGHT_SIGNAL,
  COLD_START_COMPLETE_THRESHOLD,
  DISCOVERY_ITEM_WEIGHTS,
  META_ITEM_WEIGHTS,
  META_ITEM_WEIGHTS_COLD_START,
  SIGNAL_ITEM_WEIGHTS,
  UNFINISHED_INVENTORY_LIMIT,
} from '@/modules/drip/drip.constant';
import { ScoredCandidate, ScoringCandidate } from '@/modules/drip/drip.types';
import { TopicService } from '@/modules/interest/services/topic.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryService } from '@/modules/library/library.service';
import { AUDIT_ACTION_DRIP_PREVIEW_VIEW } from '@/modules/admin/admin.constant';
import { AuditLogService } from '@/modules/partner/audit-log.service';
import { UserService } from '@/modules/user/services/user.service';
import { UserPlanProfile } from '@/modules/user/user.types';

import { DripBatchOrchestrator } from './drip-batch.orchestrator';
import {
  DripExplainView,
  DripPlanUser,
  DripPreviewCandidateView,
  DripPreviewView,
  PlanOptions,
  UserDripPlan,
} from './drip-batch.types';

/**
 * 저장 없는 계산 옵션 — 취향 캐시·자동 확장을 저장하지 않고, 스킵 사유가 나도 끝까지 계산하고, 최근 편성 주제(표시용)를
 * 읽는다. 편성 미리보기와 추천 검증이 **이 값 하나로만** 계산기를 부른다 — 어느 쪽도 저장 옵션을 켤 길이 없다.
 */
export const READ_ONLY_PLAN_OPTIONS: Readonly<PlanOptions> = Object.freeze({
  persistPreference: false,
  persistAutoExpand: false,
  stopAtSkip: false,
  loadRecentDripTopics: true,
});

/** 취향 가중치 표시 상한 — 절대값 큰 것부터 */
const PREFERENCE_WEIGHT_DISPLAY_LIMIT = 15;

/**
 * 편성 미리보기 — admin 콘솔 "추천 검증" 탭의 원천(요청 2026-09-18).
 *
 * "폰으로 완청하거나 관심 주제를 바꾼 뒤 새로고침하면, **지금 데이터로 배치를 돌리면** 어떤 2편이 정규로
 * 가고 어떤 1편이 새 주제로 가는가"에 답한다. 계산은 배치와 **같은 함수**(`DripBatchOrchestrator.planForUser`)를
 * 저장 없이 부른다 — 취향 캐시도 저장하지 않고, 적립·제외 기록·알림·배치 기록도 만들지 않는다.
 * 사용자 상태를 바꾸는 쓰기는 없다 — 유일한 쓰기는 `preview` 열람 1회마다 남기는 감사 로그 1행이다(2026-10-22).
 *
 * 대상 사용자는 가명 `user_id`로만 고르고, 이메일·닉네임은 조회하지도 싣지도 않는다(2026-10-22 — 루트 CLAUDE.md 개인정보 원칙).
 *
 * 응답에는 후보 전부의 점수 분해와 제외 사유, 취향 벡터 요약, 최근 신호, 오늘 실제 편성분을 싣는다.
 * 오디오 경로 같은 전달용 값은 싣지 않는다(admin-api 7장).
 */
@Injectable()
export class DripPreviewService {
  constructor(
    private readonly userService: UserService,
    private readonly userInterestService: UserInterestService,
    private readonly topicService: TopicService,
    private readonly contentService: ContentService,
    private readonly libraryService: LibraryService,
    private readonly orchestrator: DripBatchOrchestrator,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * 가명 `user_id`로 한 사용자의 편성을 계산한다(2026-10-22 — 종전 이메일 조회 폐기). 없거나 탈퇴했으면 404(감사 로그도 남기지
   * 않는다 — 열람한 개인 기록이 없다). 감사 로그(`drip.preview_view`)는 **계산 전에** 남긴다 — 기록이 실패하면 아무것도 돌려주지
   * 않는다(추천 검증 `RecommendInspectorService.inspect`와 같은 순서). 이 감사 로그 1행이 이 경로의 유일한 쓰기다.
   */
  async preview(
    userId: string,
    actorUserId: string,
    now: Date,
  ): Promise<DripPreviewView> {
    const user = await this.userService.findPlanProfileById(userId);

    if (!user) {
      throw new BusinessException({
        status: HttpStatus.NOT_FOUND,
        errorCode: ErrorCode.NOT_FOUND,
        message: '그 사용자를 찾을 수 없어요',
      });
    }

    await this.auditLogService.record({
      actor: actorUserId,
      action: AUDIT_ACTION_DRIP_PREVIEW_VIEW,
      target: `user:${user.id}`,
    });

    return { user: toUserView(user), ...(await this.explain(user, now)) };
  }

  /**
   * 편성 계산 결과를 화면용으로 펼친다 — 사용자 신원(이메일·닉네임)은 싣지 않는다. 편성 미리보기(`preview`)와
   * 서비스 지표의 추천 검증(`RecommendInspectorService`, 2026-10-22)이 함께 쓴다. **쓰기가 없다** — 계산은
   * `READ_ONLY_PLAN_OPTIONS`로만 부르고, 나머지는 전부 조회다.
   */
  async explain(user: DripPlanUser, now: Date): Promise<DripExplainView> {
    const plan = await this.orchestrator.planForUser(
      user,
      now,
      new Map(),
      READ_ONLY_PLAN_OPTIONS,
    );

    const [interests, removedTopicIds, todayPlacedIds] = await Promise.all([
      this.userInterestService.findAllActive(user.id),
      this.userInterestService.findUserRemovedTopicIds(user.id),
      // 오늘(서비스 날짜) 실제 배치가 적립한 것 — 미리보기와 나란히 보이면 "이미 갔다"를 구분할 수 있다
      this.libraryService.findRecentDripContentIds(
        user.id,
        toServiceDayRange(now).start,
      ),
    ]);

    const topicNames = await this.buildTopicNameMap([
      ...plan.activeTopicIds,
      ...removedTopicIds,
      ...interests.map((interest) => interest.topicId),
      ...Object.keys(plan.preference?.topicWeights ?? {}),
      ...(plan.autoExpand?.candidates.map((candidate) => candidate.topicId) ??
        []),
      ...(plan.autoExpand?.removeTopicId
        ? [plan.autoExpand.removeTopicId]
        : []),
      ...(plan.regular?.recentDripTopicIds ?? []),
      ...collectCandidateTopicIds(plan),
    ]);

    const todayPlaced = await this.contentService.findAllByIds(todayPlacedIds);

    return {
      computedAt: now,
      serviceDate: toServiceDate(now),
      skipReason: plan.skipReason,
      unfinishedCount: plan.unfinishedCount,
      unfinishedLimit: UNFINISHED_INVENTORY_LIMIT,
      dripCount: plan.dripCount,
      discoveryCount: plan.discoveryCount,
      interests: interests.map((interest) => ({
        topicId: interest.topicId,
        name: topicNames.get(interest.topicId) ?? null,
        source: interest.source,
      })),
      removedTopics: removedTopicIds.map((topicId) => ({
        topicId,
        name: topicNames.get(topicId) ?? null,
      })),
      autoExpand:
        plan.autoExpand === null
          ? null
          : {
              action: plan.autoExpand.action,
              reason: plan.autoExpand.reason,
              addTopic: toTopicRef(plan.autoExpand.addTopicId, topicNames),
              removeTopic: toTopicRef(
                plan.autoExpand.removeTopicId,
                topicNames,
              ),
              candidates: plan.autoExpand.candidates.map((candidate) => ({
                topicId: candidate.topicId,
                name: topicNames.get(candidate.topicId) ?? null,
                completes: candidate.completes,
                weight: candidate.weight,
              })),
            },
      preference: {
        isColdStart: plan.isColdStart,
        completeSignalCount: plan.completeSignalCount,
        coldStartThreshold: COLD_START_COMPLETE_THRESHOLD,
        signalCount: plan.preference?.signalCount ?? null,
        hasTasteEmbedding: (plan.preference?.tasteEmbedding ?? null) !== null,
        durationPref: plan.preference?.durationPref ?? null,
        topicWeights: topWeights(plan.preference?.topicWeights).map(
          ([topicId, weight]) => ({
            key: topicId,
            name: topicNames.get(topicId) ?? null,
            weight,
          }),
        ),
        authorWeights: topWeights(plan.preference?.authorWeights).map(
          ([key, weight]) => ({ key, name: key, weight }),
        ),
        keywordWeights: topWeights(plan.preference?.keywordWeights).map(
          ([key, weight]) => ({ key, name: key, weight }),
        ),
        formatWeights: topWeights(plan.preference?.formatWeights).map(
          ([key, weight]) => ({ key, name: key, weight }),
        ),
        difficultyAffinity: plan.difficultyAffinity,
      },
      signals: plan.signals.map((signal) => ({
        contentId: signal.contentId,
        title: plan.signalContentsById.get(signal.contentId)?.title ?? null,
        action: signal.action,
        createdAt: signal.createdAt,
      })),
      weights: {
        axes: {
          embedding: AXIS_WEIGHT_EMBEDDING,
          signal: AXIS_WEIGHT_SIGNAL,
          meta: AXIS_WEIGHT_META,
        },
        signalItems: SIGNAL_ITEM_WEIGHTS,
        metaItems: META_ITEM_WEIGHTS,
        metaItemsColdStart: META_ITEM_WEIGHTS_COLD_START,
        discoveryItems: DISCOVERY_ITEM_WEIGHTS,
      },
      regular:
        plan.regular === null
          ? null
          : {
              poolSize: plan.regular.poolSize,
              gatedOut: plan.regular.gatedOut.map((candidate) => ({
                contentId: candidate.content.id,
                title: candidate.content.title,
                reason: 'episode_order' as const,
              })),
              recentDripTopics: plan.regular.recentDripTopicIds.map(
                (topicId) => ({
                  topicId,
                  name: topicNames.get(topicId) ?? null,
                }),
              ),
              candidates: plan.regular.scored.map((candidate) =>
                toCandidateView(
                  candidate,
                  topicNames,
                  pickOrder(plan.regular?.picks ?? [], candidate),
                  null,
                  null,
                ),
              ),
            },
      discovery:
        plan.discovery === null
          ? null
          : {
              poolSize: plan.discovery.poolSize,
              qualityFloor: plan.discovery.ranking.qualityFloor,
              typicalCompleteRate: plan.discovery.ranking.typicalCompleteRate,
              excluded: plan.discovery.ranking.excluded.map(
                ({ candidate, reason }) => ({
                  contentId: candidate.content.id,
                  title: candidate.content.title,
                  reason,
                }),
              ),
              candidates: plan.discovery.ranking.scored.map((candidate) =>
                toCandidateView(
                  candidate,
                  topicNames,
                  pickOrder(plan.discovery?.picks ?? [], candidate),
                  plan.discovery?.exposureCounts.get(candidate.content.id) ?? 0,
                  !candidate.topicIds.some((topicId) =>
                    plan.activeTopicIds.includes(topicId),
                  ),
                ),
              ),
            },
      discoveryError: plan.discoveryError,
      todayPlaced: todayPlaced.map((content) => ({
        contentId: content.id,
        title: content.title,
      })),
    };
  }

  private async buildTopicNameMap(
    topicIds: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(topicIds)];

    if (unique.length === 0) {
      return new Map();
    }

    const topics = await this.topicService.findAllByIds(unique);

    return new Map(topics.map((topic) => [topic.id, topic.name]));
  }
}

function collectCandidateTopicIds(plan: UserDripPlan): string[] {
  const candidates: ScoringCandidate[] = [
    ...(plan.regular?.scored ?? []),
    ...(plan.regular?.gatedOut ?? []),
    ...(plan.discovery?.ranking.scored ?? []),
    ...(plan.discovery?.ranking.excluded.map((entry) => entry.candidate) ?? []),
  ];

  return candidates.flatMap((candidate) => candidate.topicIds);
}

function toTopicRef(
  topicId: string | null,
  topicNames: Map<string, string>,
): { topicId: string; name: string | null } | null {
  return topicId === null
    ? null
    : { topicId, name: topicNames.get(topicId) ?? null };
}

/** 화면용 사용자 — 조회한 열(`UserPlanProfile`)만 옮긴다. 신원·연락처 열은 애초에 읽지 않았다 */
function toUserView(user: UserPlanProfile): DripPreviewView['user'] {
  return {
    id: user.id,
    tier: user.tier,
    market: user.market,
    jobCategory: user.jobCategory,
    yearsOfExperience: user.yearsOfExperience,
    onboardingCompleted: user.onboardingCompleted,
  };
}

function pickOrder(
  picks: ScoredCandidate[],
  candidate: ScoredCandidate,
): number | null {
  const index = picks.findIndex(
    (pick) => pick.content.id === candidate.content.id,
  );

  return index === -1 ? null : index + 1;
}

function toCandidateView(
  candidate: ScoredCandidate,
  topicNames: Map<string, string>,
  order: number | null,
  exposureCount: number | null,
  isOutsideInterests: boolean | null,
): DripPreviewCandidateView {
  return {
    ...toContentView(candidate.content, candidate.topicIds, topicNames),
    playCount: candidate.playCount,
    completeCount: candidate.completeCount,
    hasEmbedding: candidate.embedding !== null,
    score: candidate.score,
    isSeriesContinuation: candidate.isSeriesContinuation,
    breakdown: candidate.breakdown,
    pickOrder: order,
    exposureCount,
    isOutsideInterests,
  };
}

function toContentView(
  content: Content,
  topicIds: string[],
  topicNames: Map<string, string>,
) {
  return {
    contentId: content.id,
    title: content.title,
    authorName: content.authorName,
    sourceName: content.sourceName,
    durationSec: content.durationSec,
    publishedAt: content.publishedAt,
    difficulty: content.difficulty,
    format: content.format,
    isEvergreen: content.isEvergreen,
    seriesId: content.seriesId,
    episodeNo: content.episodeNo,
    topics: topicIds.map((topicId) => ({
      topicId,
      name: topicNames.get(topicId) ?? null,
    })),
  };
}

/** 절대값 큰 순으로 상위 N개 — 표시용. 원본 맵은 이미 50개 상한이다(`PREFERENCE_WEIGHT_MAP_LIMIT`) */
function topWeights(
  weights: Record<string, number> | undefined,
): [string, number][] {
  return Object.entries(weights ?? {})
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, PREFERENCE_WEIGHT_DISPLAY_LIMIT);
}
