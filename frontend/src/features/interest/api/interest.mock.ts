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
 * - topic-unavailable  첫 저장이 INTEREST_TOPIC_UNAVAILABLE로 실패하며 '데이터·AI' 주제가
 *                      숨김 처리된다 — 재조회 후 편집 상태 재구성(사라진 선택 걷어내기) 검증
 * - load-fail          진입 조회(주제 목록·관심사)가 각 1회 실패 — IM9 전체 화면 에러 +
 *                      [다시 시도] 성공 경로 검증
 * - few-topics         노출 주제 5개만 — 온보딩 마퀴가 적은 주제 수에서도 이음새 없이 흐르는지(KAN-59)
 * - global             GLOBAL 사용자 — 영어 주제 8개(slug 있음, 사진 자산 전이라 전부 기본 사진).
 *                      온보딩 단계까지 GLOBAL 로 보려면 EXPO_PUBLIC_ONBOARDING_MOCK_SCENARIO=global 도 함께 켠다
 * - kr-no-slug         KR 주제 slug 가 전부 null — 서버 입력(BE KAN-212) 전 운영 상태. 사진이 이름 키로 붙는지(KAN-195)
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type {
  InterestsResponseDto,
  TopicItemDto,
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
/**
 * 주제 목록 — **운영 DB(topics)에서 그대로 가져온 값이다**(2026-09-06 조회, 36건).
 * id·이름·대분류가 서버와 같아야 화면이 실제로 받게 될 응답과 어긋나지 않는다.
 *
 * 서버는 `is_visible = true` 인 것만 내려주므로 실제 노출은 이보다 적다. mock 은 주제가
 * 모두 켜졌을 때를 재현해 개발 중에 전체 목록을 볼 수 있게 한다.
 *
 * 뒤쪽의 구 체계 항목(커리어 성장·이직·면접·AI·테크 트렌드·경제·인문·교양·글쓰기)은
 * 아직 테이블에 남아 있는 잔재다. 서버에서 정리되면 여기서도 지운다.
 */
const KR_MOCK_TOPIC_ROWS: Omit<TopicItemDto, 'slug'>[] = [
  { topic_id: 'f941e9e4-6e77-4cf1-a311-0b05b72907b2', name: '재테크', parent_category: '돈·경제' },
  {
    topic_id: '740cbca6-a6c3-444f-89c7-74fc380beab6',
    name: '커리어 성장',
    parent_category: '커리어',
  },
  {
    topic_id: '9bb3a706-2035-4635-82e2-5a9579d8987b',
    name: '경제 상식',
    parent_category: '돈·경제',
  },
  {
    topic_id: '15f02c9e-f4cc-4695-848e-fa20a842aca9',
    name: '이직·면접',
    parent_category: '커리어',
  },
  {
    topic_id: 'c7e55922-09b2-417d-a17b-ab7cc9df0f48',
    name: 'AI·테크 트렌드',
    parent_category: '테크',
  },
  { topic_id: 'b24e6676-b5d2-4af6-8772-2afa3394a62b', name: '투자', parent_category: '돈·경제' },
  { topic_id: '5cf5e669-b312-4025-965c-aa1356fa96fc', name: '부동산', parent_category: '돈·경제' },
  {
    topic_id: '0f7adc79-7b39-46a2-ab1f-8a0d13e5b433',
    name: '인문·교양',
    parent_category: '인문·교양',
  },
  { topic_id: '56b711a6-2d25-4430-8b2a-2a2ffeaa7331', name: '경제', parent_category: '경제 상식' },
  { topic_id: 'fb8bdf91-14b6-4bbc-8429-b45476167ddf', name: '커리어', parent_category: '일' },
  { topic_id: '08950c1f-8dc5-4912-84a1-0f33e56602cb', name: '생산성', parent_category: '일' },
  { topic_id: 'cacf0479-847b-4ebf-9d53-1ca334fa8f7d', name: '리더십', parent_category: '일' },
  { topic_id: '1ccc9700-8455-42e6-8409-6e23aa8142b0', name: '커뮤니케이션', parent_category: '일' },
  { topic_id: 'e8439fa6-ba4d-4d71-942a-d3eef0175dce', name: '조직', parent_category: '일' },
  { topic_id: '1bca0724-fc4c-4bbe-bad7-4f6ed0d0bb6d', name: '산업안전', parent_category: '일' },
  { topic_id: 'f4437504-93ff-40ad-b64f-9b7f8e4efdb9', name: '디자인', parent_category: '일' },
  { topic_id: '9f156c16-6c62-4b9c-9889-a9afb903f5fb', name: '마케팅', parent_category: '비즈니스' },
  {
    topic_id: '76198306-b237-4c37-9494-524c7266195d',
    name: '스타트업',
    parent_category: '비즈니스',
  },
  { topic_id: 'd23d0230-ccae-4f91-b52b-57c451b8de67', name: '트렌드', parent_category: '비즈니스' },
  { topic_id: '7f073abf-aef9-4fb3-b427-f8e5ae86e365', name: '경영', parent_category: '비즈니스' },
  {
    topic_id: '011b86a7-e01a-48d5-8e26-d8381774fd28',
    name: '데이터·AI',
    parent_category: '과학·기술',
  },
  {
    topic_id: 'bc60b2ee-4dbd-4fed-a905-d180a1080f36',
    name: 'IT·개발',
    parent_category: '과학·기술',
  },
  {
    topic_id: '6c4e1f8d-d188-4b3a-b79c-9b5aa4df8fd8',
    name: '자연과학',
    parent_category: '과학·기술',
  },
  {
    topic_id: 'd8b06b43-1bca-497f-a2f5-784d1309449e',
    name: '심리학',
    parent_category: '심리·마음',
  },
  {
    topic_id: '513a5413-6911-4ef3-b73a-fe979540bfdb',
    name: '뇌과학·인지',
    parent_category: '심리·마음',
  },
  {
    topic_id: 'de1b49c5-2302-4f2c-bfe5-ceb8e3f4d49e',
    name: '습관·동기',
    parent_category: '심리·마음',
  },
  {
    topic_id: '31f7325d-7c9b-4d70-a5fa-c78b14561469',
    name: '인간관계',
    parent_category: '심리·마음',
  },
  { topic_id: 'ef51225f-5692-4564-85a1-a3c2d1e85988', name: '철학', parent_category: '인문·교양' },
  { topic_id: '1faff59a-7f3e-4123-9552-50905af98359', name: '역사', parent_category: '인문·교양' },
  {
    topic_id: '90735e17-54d2-4f84-a8cc-560fd8464a6c',
    name: '사회·문화',
    parent_category: '인문·교양',
  },
  { topic_id: '60c2ae95-8df0-42d8-8e89-c16d9c4cb453', name: '예술', parent_category: '인문·교양' },
  {
    topic_id: 'c64765d6-06ea-4917-ba77-b3c2cd22ff24',
    name: '산업안전기사',
    parent_category: '자격증·시험',
  },
  {
    topic_id: '248d76c7-bf9d-419e-9b1f-ed23856bb046',
    name: 'TOPCIT',
    parent_category: '자격증·시험',
  },
  {
    topic_id: 'acd0a7f4-ad6e-42a3-be76-81b3229f52e4',
    name: '한능검',
    parent_category: '자격증·시험',
  },
  {
    topic_id: '8de02ec7-fa7e-482c-ac3a-255587fd964e',
    name: '공인중개사',
    parent_category: '자격증·시험',
  },
  { topic_id: '8b6bfb5b-e1d3-404a-ba0c-91348ff596b1', name: '글쓰기', parent_category: '배움' },
];

/**
 * KR 주제 slug — BE KAN-212 확정 표(2026-10-15)대로. 운영 입력 뒤의 응답을 재현한다(입력 전 상태는 `kr-no-slug`).
 * TOPCIT 는 표에 없어 `null` — 이름 폴백 경로가 mock 에서도 한 칸 보인다.
 */
const KR_MOCK_SLUGS: Record<string, string> = {
  재테크: 'personal-finance',
  '경제 상식': 'economics-basics',
  투자: 'investing',
  부동산: 'real-estate',
  경제: 'economy',
  '인문·교양': 'humanities',
  철학: 'philosophy',
  '사회·문화': 'society-culture',
  예술: 'art',
  커뮤니케이션: 'communication',
  산업안전: 'industrial-safety',
  마케팅: 'marketing',
  '데이터·AI': 'data-ai',
  'IT·개발': 'it-dev',
  자연과학: 'natural-science',
  심리학: 'psychology',
  '뇌과학·인지': 'neuroscience',
  '습관·동기': 'habits-motivation',
  인간관계: 'relationships',
  글쓰기: 'writing',
  커리어: 'career',
  생산성: 'productivity',
  리더십: 'leadership',
  조직: 'organization',
  디자인: 'design',
  스타트업: 'startup',
  트렌드: 'trends',
  경영: 'management',
  역사: 'history',
  세계사: 'world-history',
  한능검: 'korean-history-exam',
  공인중개사: 'real-estate-agent-exam',
  산업안전기사: 'industrial-safety-exam',
  '커리어 성장': 'career-growth',
  '이직·면접': 'job-change-interview',
  'AI·테크 트렌드': 'ai-tech-trends',
};

export const INTEREST_MOCK_TOPICS: TopicListResponseDto['items'] = KR_MOCK_TOPIC_ROWS.map((row) => ({
  ...row,
  slug: SCENARIO === 'kr-no-slug' ? null : (KR_MOCK_SLUGS[row.name] ?? null),
}));

/**
 * GLOBAL 주제 8개 — 서버 시드(backend 마이그레이션 1790100000000)와 같은 이름·slug. id 는 mock 전용이다.
 * 대분류가 없는 1단계 체계라 서버도 `parent_category`에 이름을 그대로 넣는다.
 */
const GLOBAL_TOPIC_SEED: [name: string, slug: string][] = [
  ['Korean Language', 'korean-language'],
  ['K-Food', 'k-food'],
  ['K-Pop', 'k-pop'],
  ['K-Drama & Film', 'k-drama-film'],
  ['Korean Culture', 'korean-culture'],
  ['K-Beauty & Fashion', 'k-beauty-fashion'],
  ['Korean History & Society', 'korean-history-society'],
  ['Travel in Korea', 'travel-in-korea'],
];
const GLOBAL_MOCK_TOPICS: TopicListResponseDto['items'] = GLOBAL_TOPIC_SEED.map(([name, slug]) => ({
  topic_id: `mock-global-${slug}`,
  slug,
  name,
  parent_category: name,
}));

/** 사용자 시장의 주제만 내려온다(global-api.md 4.5) — mock 은 시나리오로 시장을 고른다 */
const MARKET_TOPICS = SCENARIO === 'global' ? GLOBAL_MOCK_TOPICS : INTEREST_MOCK_TOPICS;

const initialInterests = (): UserInterestDto[] => {
  if (SCENARIO === 'global') {
    return GLOBAL_MOCK_TOPICS.slice(0, 2).map((t) => ({ topic_id: t.topic_id, source: 'onboarding' }));
  }
  if (SCENARIO === 'over-limit') {
    return [
      { topic_id: '9bb3a706-2035-4635-82e2-5a9579d8987b', source: 'onboarding' },
      { topic_id: '08950c1f-8dc5-4912-84a1-0f33e56602cb', source: 'onboarding' },
      { topic_id: 'f941e9e4-6e77-4cf1-a311-0b05b72907b2', source: 'onboarding' },
      { topic_id: '9f156c16-6c62-4b9c-9889-a9afb903f5fb', source: 'manual' },
      { topic_id: '011b86a7-e01a-48d5-8e26-d8381774fd28', source: 'auto_expand' },
    ];
  }
  return [
    { topic_id: '9bb3a706-2035-4635-82e2-5a9579d8987b', source: 'onboarding' },
    { topic_id: '08950c1f-8dc5-4912-84a1-0f33e56602cb', source: 'onboarding' },
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

const FEW_TOPICS_COUNT = 5;
const visibleTopics = (): TopicListResponseDto['items'] =>
  (SCENARIO === 'few-topics'
    ? MARKET_TOPICS.slice(0, FEW_TOPICS_COUNT)
    : MARKET_TOPICS
  ).filter((t) => !state.hiddenTopicIds.has(t.topic_id));

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
    MARKET_TOPICS.find((t) => t.topic_id === id)?.name ?? '주제';
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

  // 첫 저장 시점에 관리자가 '데이터·AI'를 숨긴 상황을 흉내 낸다 — 이후 재조회부터 목록에서 빠진다
  if (SCENARIO === 'topic-unavailable' && !state.unavailableTriggered) {
    state.unavailableTriggered = true;
    state.hiddenTopicIds.add('011b86a7-e01a-48d5-8e26-d8381774fd28');
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
