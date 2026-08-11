/**
 * 커리어 API mock — 백엔드 통합 전 화면 테스트용 대역이다. 네트워크를 가로채지 않고
 * api 모듈 안에서 구현체만 갈아끼운다(career.api.ts — interest·onboarding과 동일 관례).
 * 저장 검증(직무 100자·직군 목록 소속)을 서버처럼 수행해 에러 분기까지 화면에서
 * 검증할 수 있다. 앱 리로드 시 상태는 초기화된다.
 *
 * 시나리오 전환(EXPO_PUBLIC_CAREER_MOCK_SCENARIO):
 * - (기본)                    입력됨(기획·서비스 기획·4-6) — CR1·CR3·CR5 흐름
 * - empty                     3필드 null — CR2 미입력 + 유도 문구, [초기화] 비활성
 * - save-fail                 저장이 INTERNAL_ERROR로 실패 — CR4 인라인 에러 + [다시 시도]
 * - job-category-unavailable  첫 저장이 CAREER_JOB_CATEGORY_UNAVAILABLE로 실패하며 보낸
 *                             직군이 목록에서 빠진다 — 목록 재조회 + 직군 초기화 검증
 * - load-fail                 진입 조회(커리어·직군 목록)가 각 1회 실패 — 전체 화면 에러 +
 *                             [다시 시도] 성공 경로 검증
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import { JOB_TITLE_MAX_LENGTH } from '../career.constants';
import type {
  CareerResponseDto,
  JobCategoryListResponseDto,
  ReplaceCareerRequestDto,
} from './career.dto';

const SCENARIO = process.env.EXPO_PUBLIC_CAREER_MOCK_SCENARIO ?? 'default';

/** 스켈레톤(0.3초 지연 규칙)이 실제로 보이도록 네트워크 지연을 흉내 낸다 */
const RESPONSE_DELAY_MS = 600;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 직군 목록 fixture — 백엔드 서버 상수(user.constant.ts JOB_CATEGORIES)와 같은 7종으로
 * 시작한다(온보딩이 노출해 온 값 그대로 — career-api.md 9장 확정 2026-08-10).
 * 정의 순서가 곧 응답 순서다(정렬 기준 미정 — 상수 순서 사용).
 */
export const CAREER_MOCK_JOB_CATEGORIES: readonly string[] = [
  '개발',
  '기획',
  '디자인',
  '마케팅·영업',
  '운영·CS',
  '연구·교육',
  '기타',
];

const initialCareer = (): CareerResponseDto =>
  SCENARIO === 'empty'
    ? { job_category: null, job_title: null, years_of_experience: null }
    : { job_category: '기획', job_title: '서비스 기획', years_of_experience: '4-6' };

interface MockServerState {
  career: CareerResponseDto;
  /** 목록에서 제거된 직군 — job-category-unavailable 시나리오가 만든다 */
  hiddenCategoryNames: Set<string>;
  unavailableTriggered: boolean;
  /** load-fail 시나리오 — 각 조회의 첫 호출만 실패시켜 [다시 시도] 성공 경로까지 검증한다 */
  careerFetchFailed: boolean;
  categoriesFetchFailed: boolean;
}

const initialState = (): MockServerState => ({
  career: initialCareer(),
  hiddenCategoryNames: new Set(),
  unavailableTriggered: false,
  careerFetchFailed: false,
  categoriesFetchFailed: false,
});

let state = initialState();

export const resetCareerMock = (): void => {
  state = initialState();
};

/**
 * dev mock 공용 — 프로필 mock의 career 요약이 이 상태를 읽는다. 실서버에서는 두 화면이
 * 같은 users 행을 읽으므로, mock도 원본을 한 곳에 둬야 카드와 편집 화면이 어긋나지 않는다
 * (interest의 getInterestMockSummary와 같은 패턴).
 */
export const getCareerMockSummary = (): CareerResponseDto => ({ ...state.career });

/**
 * dev mock 공용 — 온보딩 커리어 단계 저장(PATCH /onboarding/career)이 커리어 원본을
 * 갱신한다. 온보딩에서 입력한 값이 프로필 카드·커리어 정보 화면에 그대로 이어지게 한다
 * (seedInterestMockFromOnboarding과 같은 패턴).
 */
export const seedCareerMockFromOnboarding = (career: CareerResponseDto): void => {
  state.career = { ...career };
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

const visibleCategories = (): string[] =>
  CAREER_MOCK_JOB_CATEGORIES.filter((name) => !state.hiddenCategoryNames.has(name));

export const mockFetchMyCareer = async (): Promise<CareerResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  if (SCENARIO === 'load-fail' && !state.careerFetchFailed) {
    state.careerFetchFailed = true;
    throwLoadFail('career');
  }
  return { ...state.career };
};

export const mockFetchJobCategories = async (): Promise<JobCategoryListResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  if (SCENARIO === 'load-fail' && !state.categoriesFetchFailed) {
    state.categoriesFetchFailed = true;
    throwLoadFail('job-categories');
  }
  return { items: visibleCategories().map((name) => ({ name })) };
};

export const mockReplaceMyCareer = async (
  body: ReplaceCareerRequestDto,
): Promise<CareerResponseDto> => {
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

  // 첫 저장 시점에 보낸 직군이 목록에서 제거된 상황을 흉내 낸다 — 이후 재조회부터 목록에서 빠진다
  if (
    SCENARIO === 'job-category-unavailable' &&
    !state.unavailableTriggered &&
    body.job_category !== null
  ) {
    state.unavailableTriggered = true;
    state.hiddenCategoryNames.add(body.job_category);
    throw new ApiError(
      ERROR_CODES.CAREER_JOB_CATEGORY_UNAVAILABLE,
      '선택할 수 없는 직군이에요',
      false,
      null,
      'mock-trace-category-unavailable',
      400,
    );
  }

  // 검증 순서: 형식(길이·enum) → 목록 소속(career-api.md 4.2)
  if (body.job_title !== null && body.job_title.length > JOB_TITLE_MAX_LENGTH) {
    throw new ApiError(
      ERROR_CODES.VALIDATION_FAILED,
      '입력값을 확인해주세요',
      false,
      null,
      'mock-trace-validation',
      400,
    );
  }
  if (body.job_category !== null && !visibleCategories().includes(body.job_category)) {
    throw new ApiError(
      ERROR_CODES.CAREER_JOB_CATEGORY_UNAVAILABLE,
      '선택할 수 없는 직군이에요',
      false,
      null,
      'mock-trace-category-unavailable',
      400,
    );
  }

  // 빈 문자열·공백만인 직무는 null로 정규화해 저장한다(career-api.md 2장)
  const normalizedTitle = body.job_title?.trim() ?? null;
  state.career = {
    job_category: body.job_category,
    job_title: normalizedTitle === '' ? null : normalizedTitle,
    years_of_experience: body.years_of_experience,
  };
  return { ...state.career };
};
