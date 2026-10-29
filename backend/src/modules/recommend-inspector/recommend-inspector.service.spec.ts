import { BusinessException } from '@/common/exceptions/business.exception';
import { AUDIT_ACTION_INSIGHTS_RECOMMENDATION_VIEW } from '@/modules/admin/admin.constant';
import { DripExplainView } from '@/modules/drip-batch/drip-batch.types';
import { DripPreviewService } from '@/modules/drip-batch/drip-preview.service';
import { ScoreBreakdown } from '@/modules/drip/drip.types';
import { AuditLogService } from '@/modules/partner/audit-log.service';

import { RecommendInspectorDetailResponseDto } from './dto/recommend-inspector-detail-response.dto';
import { RecommendInspectorUsersResponseDto } from './dto/recommend-inspector-users-response.dto';
import { INSPECTOR_EXPLANATION_NOTICE } from './recommend-inspector.constant';
import { RecommendInspectorRepository } from './recommend-inspector.repository';
import {
  RecommendInspectorService,
  countSignalsByTopic,
} from './recommend-inspector.service';
import { InspectorProfileRow } from './recommend-inspector.types';

const NOW = new Date('2026-10-22T03:00:00.000Z'); // KST 12:00 → 서비스 날짜 2026-10-22
const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const TOPIC_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TOPIC_B = 'bbbbbbbb-1111-4111-8111-111111111111';

/** 응답 어디에도 있으면 안 되는 개인 식별 키 */
const FORBIDDEN_KEYS = [
  'email',
  'nickname',
  'provider_user_id',
  'providerUserId',
  'profile_image_url',
  'profileImageUrl',
  'job_title',
  'jobTitle',
];

const BREAKDOWN: ScoreBreakdown = {
  embedding: 0.4,
  signal: 0.6,
  signalItems: {
    topicPreference: 0.7,
    authorPreference: null,
    keywordMatch: 0.5,
    formatPreference: null,
    durationCloseness: 0.6,
  },
  meta: 0.5,
  metaItems: {
    topicMatch: 0.6,
    freshness: 1,
    popularity: 0.5,
    difficultyFit: null,
    careerFit: null,
    seriesContinuity: null,
    exposureFatigue: null,
  },
};

function profile(): InspectorProfileRow {
  return {
    userId: USER_ID,
    tier: 'light',
    market: 'kr',
    signedUpAt: new Date('2026-10-01T00:00:00.000Z'),
    trialEndsAt: null,
    onboardingCompleted: true,
    onboardingStep: 'done',
    onboardingCompletedAt: new Date('2026-10-01T00:10:00.000Z'),
    jobCategory: 'developer',
    yearsOfExperience: 2,
    isAutoExpandEnabled: true,
  };
}

function candidate(id: string, score: number, pickOrder: number | null) {
  return {
    contentId: id,
    title: `제목 ${id}`,
    authorName: null,
    sourceName: '출처',
    durationSec: 600,
    publishedAt: NOW,
    difficulty: null,
    format: null,
    isEvergreen: null,
    seriesId: null,
    episodeNo: null,
    topics: [{ topicId: TOPIC_A, name: '경제' }],
    playCount: 3,
    completeCount: 1,
    hasEmbedding: true,
    score,
    isSeriesContinuation: false,
    breakdown: BREAKDOWN,
    pickOrder,
    exposureCount: null,
    isOutsideInterests: null,
  };
}

function explainView(): DripExplainView {
  // 25편 — 상위 20만 표에 싣고, 21위가 다양성 선정으로 뽑힌 경우도 picks 에는 실린다
  const regular = Array.from({ length: 25 }, (_, i) =>
    candidate(`r${i + 1}`, 1 - i * 0.01, i === 0 ? 1 : i === 20 ? 2 : null),
  );
  return {
    computedAt: NOW,
    serviceDate: '2026-10-22',
    skipReason: null,
    unfinishedCount: 1,
    unfinishedLimit: 5,
    dripCount: 2,
    discoveryCount: 1,
    interests: [],
    removedTopics: [],
    autoExpand: {
      action: 'none',
      reason: 'feature_off',
      addTopic: null,
      removeTopic: null,
      candidates: [
        { topicId: TOPIC_B, name: '철학', completes: 2, weight: 1.2 },
      ],
    },
    preference: {
      isColdStart: false,
      completeSignalCount: 4,
      coldStartThreshold: 3,
      signalCount: 4,
      hasTasteEmbedding: true,
      durationPref: null,
      topicWeights: [{ key: TOPIC_A, name: '경제', weight: 1.5 }],
      authorWeights: [],
      keywordWeights: [],
      formatWeights: [],
      difficultyAffinity: null,
    },
    signals: [
      { contentId: 'c1', title: 'c1', action: 'complete', createdAt: NOW },
      { contentId: 'c1', title: 'c1', action: 'play', createdAt: NOW },
      { contentId: 'c2', title: 'c2', action: 'ignore', createdAt: NOW },
    ],
    weights: {
      axes: { embedding: 0.4, signal: 0.35, meta: 0.25 },
      signalItems: { topicPreference: 0.4 },
      metaItems: { topicMatch: 0.3 },
      metaItemsColdStart: { topicMatch: 0.3 },
      discoveryItems: { lowExposure: 0.5 },
    },
    regular: {
      poolSize: 26,
      gatedOut: [{ contentId: 'g1', title: '3화', reason: 'episode_order' }],
      recentDripTopics: [],
      candidates: regular,
    },
    discovery: {
      poolSize: 3,
      qualityFloor: 0.2,
      typicalCompleteRate: 0.4,
      excluded: [
        { contentId: 'x1', title: 'x1', reason: 'below_quality_floor' },
        { contentId: 'x2', title: 'x2', reason: 'below_quality_floor' },
      ],
      candidates: [{ ...candidate('d1', 0.7, 1), isOutsideInterests: true }],
    },
    discoveryError: null,
    todayPlaced: [],
  };
}

/** 객체의 모든 키(중첩 포함) */
function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(allKeys);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => [
      key,
      ...allKeys(inner),
    ]);
  }
  return [];
}

describe('RecommendInspectorService', () => {
  let repository: jest.Mocked<RecommendInspectorRepository>;
  let dripPreviewService: jest.Mocked<DripPreviewService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let service: RecommendInspectorService;

  beforeEach(() => {
    // 저장소에는 조회 메서드만 있다 — 목도 그것만 둔다(다른 메서드를 부르면 TypeError 로 실패한다)
    repository = {
      findUsers: jest.fn().mockResolvedValue([]),
      findProfile: jest.fn().mockResolvedValue(profile()),
      findInterests: jest.fn().mockResolvedValue([]),
      findListening: jest.fn().mockResolvedValue([]),
      findDeliveries: jest.fn().mockResolvedValue([]),
      findContentTopics: jest.fn().mockResolvedValue([
        { contentId: 'c1', topicId: TOPIC_A, name: '경제' },
        { contentId: 'c2', topicId: TOPIC_A, name: '경제' },
        { contentId: 'c2', topicId: TOPIC_B, name: '철학' },
      ]),
      countExclusionSources: jest
        .fn()
        .mockResolvedValue({ libraryContents: 12, permanentlyExcluded: 3 }),
    } as unknown as jest.Mocked<RecommendInspectorRepository>;
    dripPreviewService = {
      explain: jest.fn().mockResolvedValue(explainView()),
    } as unknown as jest.Mocked<DripPreviewService>;
    auditLogService = {
      record: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<AuditLogService>;
    service = new RecommendInspectorService(
      repository,
      dripPreviewService,
      auditLogService,
    );
  });

  it('저장소 메서드는 전부 조회다 — 쓰기 메서드가 없다(save·update·insert·delete·upsert 류)', () => {
    const methods = Object.getOwnPropertyNames(
      RecommendInspectorRepository.prototype,
    ).filter((name) => name !== 'constructor');

    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect(method).toMatch(/^(find|count)/);
    }
  });

  it('상세 열람은 감사 로그 1행(actor=관리자, target=user:<id>)을 남기고, 계산은 편성 미리보기의 저장 없는 경로(explain)로만 한다', async () => {
    await service.inspect(USER_ID, ADMIN_ID, NOW);

    expect(auditLogService.record).toHaveBeenCalledTimes(1);
    expect(auditLogService.record).toHaveBeenCalledWith({
      actor: ADMIN_ID,
      action: AUDIT_ACTION_INSIGHTS_RECOMMENDATION_VIEW,
      target: `user:${USER_ID}`,
    });
    expect(AUDIT_ACTION_INSIGHTS_RECOMMENDATION_VIEW).toBe(
      'insights.recommendation_view',
    );
    // 편성 계산기에는 계산이 읽는 필드만 간다 — 이메일·닉네임 칸 자체가 없다
    expect(dripPreviewService.explain).toHaveBeenCalledWith(
      {
        id: USER_ID,
        tier: 'light',
        market: 'kr',
        jobCategory: 'developer',
        yearsOfExperience: 2,
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        // 시리즈 유료화(KAN-290)의 체험 판정 입력
        trialEndsAt: null,
      },
      NOW,
    );
  });

  it('감사 로그를 남기지 못하면 아무 데이터도 읽지 않고 실패한다 — 열람했는데 기록이 없는 상태가 없다', async () => {
    auditLogService.record.mockRejectedValue(new Error('db down'));

    await expect(service.inspect(USER_ID, ADMIN_ID, NOW)).rejects.toThrow(
      'db down',
    );
    expect(repository.findListening).not.toHaveBeenCalled();
    expect(dripPreviewService.explain).not.toHaveBeenCalled();
  });

  it('없거나 탈퇴한 사용자는 NOT_FOUND 이고 감사 로그·계산이 없다', async () => {
    repository.findProfile.mockResolvedValue(null);

    await expect(service.inspect(USER_ID, ADMIN_ID, NOW)).rejects.toThrow(
      BusinessException,
    );
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dripPreviewService.explain).not.toHaveBeenCalled();
  });

  it('편성 창은 오늘 포함 최근 14 서비스 날짜의 시작부터다 — 경계는 그날의 서비스 날짜 규칙(전환 전 04:00)을 따른다', async () => {
    await service.inspect(USER_ID, ADMIN_ID, NOW);

    // 2026-10-22 서비스 날짜에서 13일 전 = 2026-10-09 — 경계 전환(2026-10-12) 전 날이라 04:00 KST = 2026-10-08T19:00Z
    expect(repository.findDeliveries).toHaveBeenCalledWith(
      USER_ID,
      new Date('2026-10-08T19:00:00.000Z'),
      100,
    );
    expect(repository.findListening).toHaveBeenCalledWith(
      USER_ID,
      new Date('2026-09-22T03:00:00.000Z'),
      50,
    );
  });

  it('후보 목록 길이는 상한(50)으로 자른다', async () => {
    await service.listUsers('recent', 500, NOW);

    expect(repository.findUsers).toHaveBeenCalledWith(
      'recent',
      new Date('2026-09-22T03:00:00.000Z'),
      50,
    );
  });

  it('응답은 현재 시점 재계산 문구와 함께 상위 20편에 순위·편성 여부를 붙이고, 21위 이하에서 뽑힌 편도 picks 에 싣는다', async () => {
    const dto = RecommendInspectorDetailResponseDto.from(
      await service.inspect(USER_ID, ADMIN_ID, NOW),
      NOW,
    );
    const regular = dto.explanation.regular!;

    expect(dto.explanation.notice).toBe(INSPECTOR_EXPLANATION_NOTICE);
    expect(regular.top).toHaveLength(20);
    expect(regular.top[0]).toMatchObject({
      rank: 1,
      would_place: true,
      pick_order: 1,
      breakdown: { embedding: 0.4, signal: 0.6, meta: 0.5 },
    });
    expect(regular.top[1]).toMatchObject({ rank: 2, would_place: false });
    expect(regular.picks.map((p) => [p.content_id, p.rank])).toEqual([
      ['r1', 1],
      ['r21', 21],
    ]);
    expect(regular.excluded_counts).toEqual({ episode_order: 1 });
    expect(regular.candidate_count).toBe(25);
    expect(dto.explanation.discovery!.excluded_counts).toEqual({
      below_quality_floor: 2,
    });
    expect(dto.explanation.auto_expand).toMatchObject({
      action: 'none',
      reason: 'feature_off',
    });
    expect(dto.explanation.exclusion_sources).toEqual({
      library_contents: 12,
      permanently_excluded: 3,
    });
    expect(dto.explanation.preference.signal_actions).toEqual({
      complete: 1,
      play: 1,
      ignore: 1,
    });
    expect(dto.profile.career_used).toBe(true);
  });

  it('상세·목록 응답 어디에도 이메일·닉네임·제공자 ID·프로필 사진 키가 없다', async () => {
    repository.findUsers.mockResolvedValue([
      {
        userId: USER_ID,
        tier: 'light',
        signedUpAt: NOW,
        market: 'kr',
        interestCount: 3,
        plays30d: 4,
        listenSec30d: 1200,
        completes30d: 1,
        lastPlayedAt: NOW,
      },
    ]);
    const detail = RecommendInspectorDetailResponseDto.from(
      await service.inspect(USER_ID, ADMIN_ID, NOW),
      NOW,
    );
    const list = RecommendInspectorUsersResponseDto.from(
      'listen',
      await service.listUsers('listen', 20, NOW),
      NOW,
    );

    for (const body of [detail, list]) {
      const keys = allKeys(JSON.parse(JSON.stringify(body)));
      expect(keys.filter((key) => FORBIDDEN_KEYS.includes(key))).toEqual([]);
      expect(JSON.stringify(body)).not.toContain('@');
    }
  });
});

describe('countSignalsByTopic', () => {
  it('신호를 콘텐츠의 주제마다 행동별로 세고 많은 순으로 낸다', () => {
    const result = countSignalsByTopic(
      [
        { contentId: 'c1', action: 'complete' },
        { contentId: 'c1', action: 'play' },
        { contentId: 'c2', action: 'ignore' },
        { contentId: 'unknown', action: 'play' },
      ],
      [
        { contentId: 'c1', topicId: TOPIC_A, name: '경제' },
        { contentId: 'c2', topicId: TOPIC_A, name: '경제' },
        { contentId: 'c2', topicId: TOPIC_B, name: '철학' },
      ],
    );

    expect(result).toEqual([
      {
        topicId: TOPIC_A,
        name: '경제',
        counts: { complete: 1, play: 1, ignore: 1 },
        total: 3,
      },
      { topicId: TOPIC_B, name: '철학', counts: { ignore: 1 }, total: 1 },
    ]);
  });
});
