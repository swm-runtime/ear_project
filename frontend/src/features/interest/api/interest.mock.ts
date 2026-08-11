/**
 * 관심사 API mock — 백엔드 엔드포인트가 구현되기 전 화면 테스트용 대역이다.
 * 네트워크를 가로채지 않고 api 모듈 안에서 구현체만 갈아끼운다(interest.api.ts — onboarding과 동일 관례).
 * 저장 검증(하한·주제 유효성·상한 max(3, 기존 개수))을 서버처럼 수행해 에러 분기까지 화면에서
 * 검증할 수 있다. 앱 리로드 시 상태는 초기화된다.
 *
 * 시나리오 전환(EXPO_PUBLIC_INTEREST_MOCK_SCENARIO):
 * - (기본)             2개 보유(온보딩 선택분) — IM1~IM5·IM7 흐름
 * - over-limit         5개 보유(상한 도입 이전 가입자) — IM6 초과 보유자
 * - save-fail          저장이 INTERNAL_ERROR로 실패 — IM8 인라인 에러 + [다시 시도]
 * - topic-unavailable  첫 저장이 INTEREST_TOPIC_UNAVAILABLE로 실패하며 'IT·테크' 주제가
 *                      숨김 처리된다 — 재조회 후 편집 상태 재구성(사라진 선택 걷어내기) 검증
 * - load-fail          진입 조회(주제 목록·관심사)가 각 1회 실패 — IM9 전체 화면 에러 +
 *                      [다시 시도] 성공 경로 검증
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type {
  InterestsResponseDto,
  TopicListResponseDto,
  UserInterestDto,
} from './interest.dto';

const SCENARIO = process.env.EXPO_PUBLIC_INTEREST_MOCK_SCENARIO ?? 'default';

/** 스켈레톤(0.3초 지연 규칙)이 실제로 보이도록 네트워크 지연을 흉내 낸다 */
const RESPONSE_DELAY_MS = 600;
/** 서버 상한 — 실제로는 GET /onboarding/topics의 max_selectable로 내려온다 */
const MAX_SELECTABLE = 3;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 주제 목록 fixture — 온보딩 mock(추천 생성의 주제명 조인)도 같은 목록을 쓴다.
 * 두 벌을 두면 온보딩에서 고른 topic_id가 이 화면에서 이름을 잃는다.
 */
export const INTEREST_MOCK_TOPICS: TopicListResponseDto['items'] = [
  { topic_id: 'topic-career', name: '커리어', parent_category: '일' },
  { topic_id: 'topic-productivity', name: '생산성', parent_category: '일' },
  { topic_id: 'topic-economy', name: '경제·재테크', parent_category: '돈' },
  { topic_id: 'topic-tech', name: 'IT·테크', parent_category: '기술' },
  { topic_id: 'topic-ai', name: '인공지능', parent_category: '기술' },
  { topic_id: 'topic-marketing', name: '마케팅', parent_category: '일' },
  { topic_id: 'topic-design', name: '디자인', parent_category: '일' },
  { topic_id: 'topic-startup', name: '스타트업', parent_category: '일' },
  { topic_id: 'topic-psychology', name: '심리', parent_category: '삶' },
  { topic_id: 'topic-leadership', name: '리더십', parent_category: '일' },
];

const initialInterests = (): UserInterestDto[] => {
  if (SCENARIO === 'over-limit') {
    return [
      { topic_id: 'topic-career', source: 'onboarding' },
      { topic_id: 'topic-productivity', source: 'onboarding' },
      { topic_id: 'topic-economy', source: 'onboarding' },
      { topic_id: 'topic-tech', source: 'manual' },
      { topic_id: 'topic-ai', source: 'auto_expand' },
    ];
  }
  return [
    { topic_id: 'topic-career', source: 'onboarding' },
    { topic_id: 'topic-economy', source: 'onboarding' },
  ];
};

interface MockServerState {
  interests: UserInterestDto[];
  /** 관리자가 숨긴 주제(is_visible = false) — 목록·관심사 응답·diff 범위에서 제외된다 */
  hiddenTopicIds: Set<string>;
  unavailableTriggered: boolean;
  /** load-fail 시나리오 — 각 조회의 첫 호출만 실패시켜 [다시 시도] 성공 경로까지 검증한다 */
  topicsFetchFailed: boolean;
  interestsFetchFailed: boolean;
}

const initialState = (): MockServerState => ({
  interests: initialInterests(),
  hiddenTopicIds: new Set(),
  unavailableTriggered: false,
  topicsFetchFailed: false,
  interestsFetchFailed: false,
});

let state = initialState();

export const resetInterestMock = (): void => {
  state = initialState();
};

const throwLoadFail = (traceSuffix: string): never => {
  throw new ApiError(
    ERROR_CODES.INTERNAL_ERROR,
    '요청을 처리하지 못했어요. 다시 시도해주세요',
    false,
    null,
    `mock-trace-load-fail-${traceSuffix}`,
    500,
  );
};

const visibleTopics = (): TopicListResponseDto['items'] =>
  INTEREST_MOCK_TOPICS.filter((t) => !state.hiddenTopicIds.has(t.topic_id));

/** 숨겨진 주제의 활성 관심사는 응답에서 제외한다(interest-management-api.md 4.2) */
const visibleInterests = (): UserInterestDto[] =>
  state.interests.filter((i) => !state.hiddenTopicIds.has(i.topic_id));

/**
 * dev mock 공용 — 프로필·설정 mock의 interest_summary가 이 상태를 읽는다.
 * 실서버에서는 세 화면이 같은 user_interests를 읽으므로, mock도 원본을 한 곳에 둬야
 * 카드와 편집 화면이 어긋나지 않는다. 대표 주제는 응답 순서 앞 3개다(profile-api.md 4.1).
 */
export const getInterestMockSummary = (): {
  count: number;
  top_topics: { id: string; name: string }[];
} => {
  const interests = visibleInterests();
  const nameOf = (id: string): string =>
    INTEREST_MOCK_TOPICS.find((t) => t.topic_id === id)?.name ?? '주제';
  return {
    count: interests.length,
    top_topics: interests
      .slice(0, 3)
      .map((interest) => ({ id: interest.topic_id, name: nameOf(interest.topic_id) })),
  };
};

/**
 * dev mock 공용 — 온보딩 1단계 저장(PUT /onboarding/interests)이 관심사 원본을 갱신한다.
 * 온보딩에서 고른 주제가 프로필 카드·관심사 관리에 그대로 이어지게 한다.
 */
export const seedInterestMockFromOnboarding = (topicIds: string[]): void => {
  state.interests = topicIds.map((id) => ({ topic_id: id, source: 'onboarding' }));
};

export const mockFetchTopics = async (): Promise<TopicListResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  if (SCENARIO === 'load-fail' && !state.topicsFetchFailed) {
    state.topicsFetchFailed = true;
    throwLoadFail('topics');
  }
  return { items: visibleTopics(), max_selectable: MAX_SELECTABLE, is_fallback: false };
};

export const mockFetchMyInterests = async (): Promise<InterestsResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  if (SCENARIO === 'load-fail' && !state.interestsFetchFailed) {
    state.interestsFetchFailed = true;
    throwLoadFail('interests');
  }
  return { interests: visibleInterests() };
};

export const mockSaveMyInterests = async (topicIds: string[]): Promise<InterestsResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  if (SCENARIO === 'save-fail') {
    throw new ApiError(
      ERROR_CODES.INTERNAL_ERROR,
      '요청을 처리하지 못했어요. 다시 시도해주세요',
      false,
      null,
      'mock-trace-save-fail',
      500,
    );
  }

  // 첫 저장 시점에 관리자가 'IT·테크'를 숨긴 상황을 흉내 낸다 — 이후 재조회부터 목록에서 빠진다
  if (SCENARIO === 'topic-unavailable' && !state.unavailableTriggered) {
    state.unavailableTriggered = true;
    state.hiddenTopicIds.add('topic-tech');
    throw new ApiError(
      ERROR_CODES.INTEREST_TOPIC_UNAVAILABLE,
      '선택할 수 없는 주제가 포함되어 있어요',
      false,
      null,
      'mock-trace-topic-unavailable',
      400,
    );
  }

  // 검증 순서: 하한 → 주제 유효성 → 상한(interest-management-api.md 4.3)
  if (topicIds.length === 0) {
    throw new ApiError(
      ERROR_CODES.INTEREST_REQUIRED,
      '관심 주제를 1개 이상 선택해주세요',
      false,
      null,
      'mock-trace-required',
      400,
    );
  }
  const visibleIds = new Set(visibleTopics().map((t) => t.topic_id));
  const hasUnavailable =
    topicIds.some((id) => !visibleIds.has(id)) || new Set(topicIds).size !== topicIds.length;
  if (hasUnavailable) {
    throw new ApiError(
      ERROR_CODES.INTEREST_TOPIC_UNAVAILABLE,
      '선택할 수 없는 주제가 포함되어 있어요',
      false,
      null,
      'mock-trace-topic-unavailable',
      400,
    );
  }
  // 상한은 상수 3이 아니라 "기존 개수보다 늘어나지 않으면 통과"다(초과 보유자 강제 축소 금지)
  const beforeCount = visibleInterests().length;
  if (topicIds.length > Math.max(MAX_SELECTABLE, beforeCount)) {
    throw new ApiError(
      ERROR_CODES.INTEREST_LIMIT_EXCEEDED,
      '관심 주제는 3개까지 선택할 수 있어요',
      false,
      null,
      'mock-trace-limit',
      400,
    );
  }

  // diff 반영 — 유지분의 source는 덮지 않고, 추가분만 manual로 만든다. 숨겨진 주제의 행은 건드리지 않는다
  const requested = new Set(topicIds);
  const kept = state.interests.filter(
    (i) => requested.has(i.topic_id) || state.hiddenTopicIds.has(i.topic_id),
  );
  const keptIds = new Set(kept.map((i) => i.topic_id));
  const added: UserInterestDto[] = topicIds
    .filter((id) => !keptIds.has(id))
    .map((id) => ({ topic_id: id, source: 'manual' }));
  state.interests = [...kept, ...added];

  return { interests: visibleInterests() };
};
