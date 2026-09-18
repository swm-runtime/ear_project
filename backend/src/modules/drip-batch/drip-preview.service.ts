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
import { User } from '@/modules/user/entities/user.entity';
import { UserService } from '@/modules/user/services/user.service';

import { DripBatchOrchestrator } from './drip-batch.orchestrator';
import {
  DripPreviewCandidateView,
  DripPreviewView,
  UserDripPlan,
} from './drip-batch.types';

/** 취향 가중치 표시 상한 — 절대값 큰 것부터 */
const PREFERENCE_WEIGHT_DISPLAY_LIMIT = 15;

/**
 * 편성 미리보기 — admin 콘솔 "추천 검증" 탭의 원천(요청 2026-09-18).
 *
 * "폰으로 완청하거나 관심 주제를 바꾼 뒤 새로고침하면, **지금 데이터로 배치를 돌리면** 어떤 2편이 정규로
 * 가고 어떤 1편이 새 주제로 가는가"에 답한다. 계산은 배치와 **같은 함수**(`DripBatchOrchestrator.planForUser`)를
 * 저장 없이 부른다 — 취향 캐시도 저장하지 않고, 적립·제외 기록·알림·배치 기록도 만들지 않는다.
 * 이 서비스가 하는 쓰기는 없다.
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
  ) {}

  async preview(email: string, now: Date): Promise<DripPreviewView> {
    const user = await this.userService.findByEmail(email);

    if (!user) {
      throw new BusinessException({
        status: HttpStatus.NOT_FOUND,
        errorCode: ErrorCode.NOT_FOUND,
        message: '그 이메일의 사용자를 찾을 수 없어요',
      });
    }

    const plan = await this.orchestrator.planForUser(user, now, new Map(), {
      persistPreference: false,
      stopAtSkip: false,
    });

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
      ...(plan.regular?.recentDripTopicIds ?? []),
      ...collectCandidateTopicIds(plan),
    ]);

    const todayPlaced = await this.contentService.findAllByIds(todayPlacedIds);

    return {
      computedAt: now,
      serviceDate: toServiceDate(now),
      user: toUserView(user),
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

function toUserView(user: User): DripPreviewView['user'] {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    tier: user.tier,
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
