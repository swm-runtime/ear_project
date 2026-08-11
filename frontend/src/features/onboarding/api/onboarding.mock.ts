/**
 * 온보딩 API mock — 백엔드 엔드포인트가 구현되기 전 화면 테스트용 대역이다.
 * 이 프로젝트의 mock 관례(경계 모듈의 개발 환경 분기 — backend dev.client.ts와 동일한 접근)를 따라
 * 네트워크를 가로채지 않고 api 모듈 안에서 구현체만 갈아끼운다(onboarding.api.ts).
 *
 * 단계 전이를 서버처럼 상태로 들고 있어 재개(GET /state)·전진 흐름을 화면에서 검증할 수 있다.
 * 앱 리로드 시 상태는 초기화된다.
 *
 * 시나리오 전환(EXPO_PUBLIC_ONBOARDING_MOCK_SCENARIO):
 * - (기본)      정상 경로. 이번 달 인기 3건, 첫 드립은 2회 폴링 후 completed
 * - discovery   월간 표본 부족 — 두 번째 섹션이 topic_discovery(O7-b)로 내려온다
 * - empty       추천 0건(데이터 정합성 오류 경로) — sections: []
 * - drip-queued 첫 드립이 서버 재시도 소진으로 queued 종료
 */
import { INTEREST_MOCK_TOPICS, seedInterestMockFromOnboarding } from '@/features/interest';

import type {
  CareerDto,
  CompleteResponseDto,
  FirstDripResponseDto,
  OnboardingStateDto,
  RecommendationSectionDto,
  RecommendationsResponseDto,
  SaveCareerRequestDto,
  SaveCareerResponseDto,
  SaveInterestsResponseDto,
  SavePicksResponseDto,
} from './onboarding.dto';
import type { OnboardingStep } from '../onboarding.types';

const SCENARIO = process.env.EXPO_PUBLIC_ONBOARDING_MOCK_SCENARIO ?? 'default';

/** 스켈레톤(0.3초 지연 규칙)이 실제로 보이도록 네트워크 지연을 흉내 낸다 */
const RESPONSE_DELAY_MS = 600;
/** 첫 드립이 completed로 바뀌기까지의 폴링 횟수 — O13 로딩을 눈으로 확인할 수 있게 한다 */
const FIRST_DRIP_PENDING_POLLS = 2;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// 주제 fixture는 interest mock이 소유한다 — 1단계에서 고른 topic_id가 추천 생성에서
// 이름을 잃지 않도록 같은 목록을 조인한다(주제 목록 조회 자체도 interest feature 몫이다)
const MOCK_TOPICS = INTEREST_MOCK_TOPICS;

interface MockServerState {
  step: OnboardingStep;
  completed: boolean;
  selectedTopicIds: string[];
  career: CareerDto;
  pickedContentIds: string[];
  firstDripPollCount: number;
}

const initialState = (): MockServerState => ({
  step: 'topic',
  completed: false,
  selectedTopicIds: [],
  career: { job_category: null, job_title: null, years_of_experience: null },
  pickedContentIds: [],
  firstDripPollCount: 0,
});

let state = initialState();

export const resetOnboardingMock = (): void => {
  state = initialState();
};

const topicName = (topicId: string): string =>
  MOCK_TOPICS.find((t) => t.topic_id === topicId)?.name ?? '주제';

const makeContent = (
  seq: number,
  topicId: string,
  title: string,
): RecommendationSectionDto['items'][number] => ({
  content_id: `content-${String(seq).padStart(2, '0')}`,
  title,
  author_name: `김이어 ${seq}`,
  source_name: '이어 스튜디오',
  thumbnail_url: `https://picsum.photos/seed/ear-${seq}/200/200`,
  duration_sec: 480 + seq * 37,
  topics: [{ topic_id: topicId, name: topicName(topicId) }],
});

export const mockFetchState = async (): Promise<OnboardingStateDto> => {
  await delay(RESPONSE_DELAY_MS);
  return {
    onboarding_completed: state.completed,
    onboarding_step: state.step,
    selected_topic_ids: state.selectedTopicIds,
    career: state.career,
    picked_count: state.pickedContentIds.length,
  };
};

export const mockSaveInterests = async (topicIds: string[]): Promise<SaveInterestsResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  state.selectedTopicIds = topicIds;
  state.step = 'career';
  // 관심사 원본(interest mock)을 갱신한다 — 온보딩에서 고른 주제가 프로필 카드·관심사 관리에 이어진다
  seedInterestMockFromOnboarding(topicIds);
  return { selected_topic_ids: topicIds, onboarding_step: 'career' };
};

export const mockSaveCareer = async (body: SaveCareerRequestDto): Promise<SaveCareerResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  state.career = {
    job_category: body.job_category !== undefined ? body.job_category : state.career.job_category,
    job_title: body.job_title !== undefined ? body.job_title : state.career.job_title,
    years_of_experience:
      body.years_of_experience !== undefined
        ? body.years_of_experience
        : state.career.years_of_experience,
  };
  state.step = 'pick';
  return { career: state.career, onboarding_step: 'pick' };
};

export const mockFetchRecommendations = async (): Promise<RecommendationsResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  if (SCENARIO === 'empty') {
    return { sections: [] };
  }

  // 관심 주제 6건 — 선택 주제에 고르게 배분한다(onboarding.md 4 [3])
  const selected = state.selectedTopicIds.length > 0 ? state.selectedTopicIds : ['topic-career'];
  const interestItems = Array.from({ length: 6 }, (_, i) => {
    const topicId = selected[i % selected.length];
    return makeContent(i + 1, topicId, `${topicName(topicId)} 이야기 ${i + 1}`);
  });

  // 두 번째 섹션 3건 — 관심 주제 밖에서 뽑는다
  const outsideTopics = MOCK_TOPICS.filter((t) => !selected.includes(t.topic_id)).slice(0, 3);
  const isDiscovery = SCENARIO === 'discovery';
  const secondItems = outsideTopics.map((topic, i) =>
    makeContent(7 + i, topic.topic_id, `${topic.name} 입문 ${i + 1}`),
  );

  return {
    sections: [
      { section_type: 'interest', title: '관심 주제 추천', items: interestItems },
      isDiscovery
        ? { section_type: 'topic_discovery', title: '이런 주제는 어때요?', items: secondItems }
        : { section_type: 'monthly_popular', title: '이번 달 인기', items: secondItems },
    ],
  };
};

export const mockSavePicks = async (contentIds: string[]): Promise<SavePicksResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const unique = [...new Set(contentIds)];
  state.pickedContentIds = [...new Set([...state.pickedContentIds, ...unique])];
  return {
    saved_content_ids: unique,
    failed: [],
    picked_count: state.pickedContentIds.length,
  };
};

export const mockComplete = async (): Promise<CompleteResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  state.completed = true;
  state.step = 'done';
  state.firstDripPollCount = 0;
  const awaitsFirstDrip = state.pickedContentIds.length === 0;
  return {
    onboarding_completed: true,
    onboarding_step: 'done',
    onboarding_completed_at: new Date().toISOString(),
    picked_count: state.pickedContentIds.length,
    awaits_first_drip: awaitsFirstDrip,
    first_drip: awaitsFirstDrip
      ? { status: 'pending', poll_interval_sec: 1, max_wait_sec: 15 }
      : null,
  };
};

export const mockFetchFirstDrip = async (): Promise<FirstDripResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  state.firstDripPollCount += 1;
  if (state.firstDripPollCount <= FIRST_DRIP_PENDING_POLLS) {
    return { status: 'pending', library_item_count: null, completed_at: null };
  }
  if (SCENARIO === 'drip-queued') {
    return { status: 'queued', library_item_count: null, completed_at: null };
  }
  return { status: 'completed', library_item_count: 2, completed_at: new Date().toISOString() };
};

