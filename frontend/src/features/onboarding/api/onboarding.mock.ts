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
 * - global      GLOBAL 사용자 — steps = ["topic"](커리어 생략). 주제 저장이 곧바로 pick(완료 대기)으로 간다(global-api.md 4.4).
 *               영어 주제 목록까지 보려면 EXPO_PUBLIC_INTEREST_MOCK_SCENARIO=global 도 함께 켠다
 * - no-steps    steps 필드가 빠진 응답(배포 전 서버) — 종전 단계(주제 → 커리어)로 동작하는지
 */
import { seedCareerMockFromOnboarding } from '@/features/career';
import { seedInterestMockFromOnboarding } from '@/features/interest';

import type {
  CareerDto,
  CompleteResponseDto,
  FirstDripResponseDto,
  OnboardingStateDto,
  SaveCareerRequestDto,
  SaveCareerResponseDto,
  SaveInterestsResponseDto,
} from './onboarding.dto';
import type { OnboardingStep } from '../onboarding.types';

const SCENARIO = process.env.EXPO_PUBLIC_ONBOARDING_MOCK_SCENARIO ?? 'default';

/** 스켈레톤(0.3초 지연 규칙)이 실제로 보이도록 네트워크 지연을 흉내 낸다 */
const RESPONSE_DELAY_MS = 600;
/** 첫 드립이 completed로 바뀌기까지의 폴링 횟수 — O13 로딩을 눈으로 확인할 수 있게 한다 */
const FIRST_DRIP_PENDING_POLLS = 2;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 서버가 시장으로 고르는 단계 배열 — KR ["topic","career"], GLOBAL ["topic"](global-api.md 4.4) */
const MOCK_STEPS: string[] = SCENARIO === 'global' ? ['topic'] : ['topic', 'career'];

interface MockServerState {
  step: OnboardingStep;
  completed: boolean;
  selectedTopicIds: string[];
  career: CareerDto;
  firstDripPollCount: number;
}

const initialState = (): MockServerState => ({
  step: 'topic',
  completed: false,
  selectedTopicIds: [],
  career: { job_category: null, job_title: null, years_of_experience: null },
  firstDripPollCount: 0,
});

let state = initialState();

export const resetOnboardingMock = (): void => {
  state = initialState();
};

export const mockFetchState = async (): Promise<OnboardingStateDto> => {
  await delay(RESPONSE_DELAY_MS);
  return {
    onboarding_completed: state.completed,
    onboarding_step: state.step,
    ...(SCENARIO !== 'no-steps' && { steps: MOCK_STEPS }),
    selected_topic_ids: state.selectedTopicIds,
    career: state.career,
    picked_count: 0,
  };
};

export const mockSaveInterests = async (topicIds: string[]): Promise<SaveInterestsResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  state.selectedTopicIds = topicIds;
  // 커리어 단계가 없는 시장(GLOBAL)은 곧바로 pick(완료 대기)이다(global-api.md 4.4)
  state.step = MOCK_STEPS.includes('career') ? 'career' : 'pick';
  // 관심사 원본(interest mock)을 갱신한다 — 온보딩에서 고른 주제가 프로필 카드·관심사 관리에 이어진다
  seedInterestMockFromOnboarding(topicIds);
  return { selected_topic_ids: topicIds, onboarding_step: state.step };
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
  // 커리어 원본(career mock)을 갱신한다 — 온보딩에서 입력한 값이 프로필 카드·커리어 정보 화면에 이어진다
  seedCareerMockFromOnboarding(state.career);
  return { career: state.career, onboarding_step: 'pick' };
};

export const mockComplete = async (): Promise<CompleteResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  state.completed = true;
  state.step = 'done';
  state.firstDripPollCount = 0;
  // 담기 단계가 없어 적립 0건 — 늘 첫 드립을 기다린다(2026-10-11)
  const awaitsFirstDrip = true;
  return {
    onboarding_completed: true,
    onboarding_step: 'done',
    onboarding_completed_at: new Date().toISOString(),
    picked_count: 0,
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

