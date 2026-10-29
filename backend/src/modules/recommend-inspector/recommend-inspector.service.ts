import { HttpStatus, Injectable } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import {
  shiftServiceDate,
  serviceDateStart,
  toServiceDate,
} from '@/common/utils/service-date.util';
import { AUDIT_ACTION_INSIGHTS_RECOMMENDATION_VIEW } from '@/modules/admin/admin.constant';
import { DripExplainView } from '@/modules/drip-batch/drip-batch.types';
import { DripPreviewService } from '@/modules/drip-batch/drip-preview.service';
import { AuditLogService } from '@/modules/partner/audit-log.service';
import { UserMarket, UserTier } from '@/modules/user/user.enum';

import {
  INSPECTOR_DELIVERY_LIMIT,
  INSPECTOR_DELIVERY_SERVICE_DAYS,
  INSPECTOR_LISTENING_DAYS,
  INSPECTOR_LISTENING_LIMIT,
  INSPECTOR_USERS_MAX_LIMIT,
} from './recommend-inspector.constant';
import { RecommendInspectorRepository } from './recommend-inspector.repository';
import {
  InspectorDeliveryRow,
  InspectorInterestRow,
  InspectorListeningRow,
  InspectorProfileRow,
  InspectorSignalTopicCount,
  InspectorUserRow,
  InspectorUserSort,
} from './recommend-inspector.types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface InspectorDetail {
  profile: InspectorProfileRow;
  interests: InspectorInterestRow[];
  listening: { since: Date; items: InspectorListeningRow[] };
  deliveries: { since: Date; items: InspectorDeliveryRow[] };
  explanation: {
    view: DripExplainView;
    signalTopicCounts: InspectorSignalTopicCount[];
    exclusionSources: { libraryContents: number; permanentlyExcluded: number };
  };
}

/**
 * 서비스 지표 "추천 검증"(2026-10-22) — 관리자가 가명(`user_id`) 사용자 한 명을 골라 **무엇을 들었고, 추천이 무엇을 보냈고,
 * 지금 계산하면 점수가 어떻게 나오는지**를 본다.
 *
 * 법적 근거: 개인정보 처리방침의 처리 목적 "콘텐츠 편성과 추천 · 서비스 개선" — 추천 결과를 검증하는 데 필요한 행동 기록만
 * 읽고, 이름·이메일·연락처는 조회하지 않는다. 상세 열람은 1회마다 감사 로그(`insights.recommendation_view`)를 남긴다.
 *
 * **읽기 전용이다.** 사용자 상태를 바꾸는 쓰기는 하나도 없다 — 조회는 `RecommendInspectorRepository`(SELECT 만)와
 * `DripPreviewService.explain`(편성 계산기를 `READ_ONLY_PLAN_OPTIONS`로 — 취향 캐시·자동 확장 저장, 적립, 제외 기록,
 * 알림, 배치 기록 모두 없음)뿐이다. 유일한 쓰기는 감사 로그 1행이다.
 */
@Injectable()
export class RecommendInspectorService {
  constructor(
    private readonly repository: RecommendInspectorRepository,
    private readonly dripPreviewService: DripPreviewService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** 후보 사용자 — `listen`: 최근 30일 청취 시간 순(청취가 있는 사용자만), `recent`: 마지막 재생(없으면 가입) 최신 순 */
  async listUsers(
    sort: InspectorUserSort,
    limit: number,
    now: Date,
  ): Promise<{ since: Date; users: InspectorUserRow[] }> {
    const since = new Date(now.getTime() - INSPECTOR_LISTENING_DAYS * DAY_MS);
    const clamped = Math.min(Math.max(1, limit), INSPECTOR_USERS_MAX_LIMIT);

    return {
      since,
      users: await this.repository.findUsers(sort, since, clamped),
    };
  }

  /**
   * 한 사용자의 상세. 없거나 탈퇴했으면 404(감사 로그도 남기지 않는다 — 열람한 개인 기록이 없다).
   * 감사 로그를 **데이터를 읽기 전에** 남긴다 — 기록이 실패하면 아무것도 돌려주지 않는다(열람했는데 기록이 없는 상태가 없다).
   * 질의는 순차로 부른다(서비스 지표 요약과 같은 이유 — 운영 DB 연결을 한 번에 여럿 잡지 않는다).
   */
  async inspect(
    userId: string,
    actorUserId: string,
    now: Date,
  ): Promise<InspectorDetail> {
    const profile = await this.repository.findProfile(userId);

    if (!profile) {
      throw new BusinessException({
        status: HttpStatus.NOT_FOUND,
        errorCode: ErrorCode.NOT_FOUND,
        message: '그 사용자를 찾을 수 없어요',
      });
    }

    await this.auditLogService.record({
      actor: actorUserId,
      action: AUDIT_ACTION_INSIGHTS_RECOMMENDATION_VIEW,
      target: `user:${userId}`,
    });

    const listeningSince = new Date(
      now.getTime() - INSPECTOR_LISTENING_DAYS * DAY_MS,
    );
    // 오늘 포함 최근 14 서비스 날짜 — 05:00 경계의 그날 시작부터
    const deliveriesSince = serviceDateStart(
      shiftServiceDate(toServiceDate(now), 1 - INSPECTOR_DELIVERY_SERVICE_DAYS),
    );

    const interests = await this.repository.findInterests(userId);
    const listening = await this.repository.findListening(
      userId,
      listeningSince,
      INSPECTOR_LISTENING_LIMIT,
    );
    const deliveries = await this.repository.findDeliveries(
      userId,
      deliveriesSince,
      INSPECTOR_DELIVERY_LIMIT,
    );
    // 편성 계산기가 읽는 필드만 넘긴다 — 이메일·닉네임은 애초에 조회하지 않았다
    const view = await this.dripPreviewService.explain(
      {
        id: profile.userId,
        tier: profile.tier as UserTier,
        market: profile.market as UserMarket,
        jobCategory: profile.jobCategory,
        yearsOfExperience: profile.yearsOfExperience,
        // 짧은 판 코호트(KAN-298) 판정 입력 — 배치와 같은 후보를 보려면 가입 시각이 필요하다
        createdAt: profile.signedUpAt,
      },
      now,
    );
    const contentTopics = await this.repository.findContentTopics([
      ...new Set(view.signals.map((signal) => signal.contentId)),
    ]);
    const exclusionSources =
      await this.repository.countExclusionSources(userId);

    return {
      profile,
      interests,
      listening: { since: listeningSince, items: listening },
      deliveries: { since: deliveriesSince, items: deliveries },
      explanation: {
        view,
        signalTopicCounts: countSignalsByTopic(view.signals, contentTopics),
        exclusionSources,
      },
    };
  }
}

/**
 * 취향 계산 입력 신호를 주제 × 행동으로 센다 — "주제 가중치가 왜 이 값인가"의 재료. 한 콘텐츠가 주제 둘이면 양쪽에 센다
 * (취향 계산도 콘텐츠의 주제마다 반영한다). 많은 순.
 */
export function countSignalsByTopic(
  signals: { contentId: string; action: string }[],
  contentTopics: { contentId: string; topicId: string; name: string | null }[],
): InspectorSignalTopicCount[] {
  const topicsByContent = new Map<
    string,
    { topicId: string; name: string | null }[]
  >();
  for (const row of contentTopics) {
    const list = topicsByContent.get(row.contentId) ?? [];
    list.push({ topicId: row.topicId, name: row.name });
    topicsByContent.set(row.contentId, list);
  }

  const byTopic = new Map<string, InspectorSignalTopicCount>();
  for (const signal of signals) {
    for (const topic of topicsByContent.get(signal.contentId) ?? []) {
      const entry = byTopic.get(topic.topicId) ?? {
        topicId: topic.topicId,
        name: topic.name,
        counts: {},
        total: 0,
      };
      entry.counts[signal.action] = (entry.counts[signal.action] ?? 0) + 1;
      entry.total += 1;
      byTopic.set(topic.topicId, entry);
    }
  }

  return [...byTopic.values()].sort(
    (a, b) => b.total - a.total || a.topicId.localeCompare(b.topicId),
  );
}
