/**
 * 프로필 API mock — 백엔드 엔드포인트가 구현되기 전 화면 테스트용 대역이다.
 * 다른 mock과 같은 관례로, api 모듈 안에서 구현체만 갈아끼운다(DTO를 반환해 변환까지 공통 경로를 지난다).
 *
 * 시나리오 전환(EXPO_PUBLIC_PROFILE_MOCK_SCENARIO):
 * - (기본)               구독 중·인증 이메일·통계 정상 — P1, P8, P9(주 이동·가입 주 경계·이번 주 복귀)
 * - free                 무료 플랜(daily_play_limit 3 — 2가 아닌 값으로 하드코딩을 탐지한다) — P2
 * - email-unverified     주소 있음 + 미인증 배지 — P3
 * - email-unregistered   email null — P4
 * - cancel-scheduled     해지 예약(중립 톤) — P5
 * - grace                결제 문제(경고 톤) — P5
 * - career-empty         커리어 3필드 null — 카드 미입력 변형. "+2"(외 N개)는 관심사 원본이
 *                        interest mock으로 통합되어 EXPO_PUBLIC_INTEREST_MOCK_SCENARIO=over-limit과 조합해 본다
 * - partial-error        plan 섹션만 실패 — P7 부분(플랜 카드만 에러, 탭은 동작)
 * - full-error           요약 전체 500 — P7 전체(화면은 열림·설정 아이콘 즉시 노출)
 * - stats-empty          신규 사용자(3지표 0·빈 그래프·분포 없음) — P10 변형 A
 * - stats-error          stats 섹션만 실패 — P10 변형 B
 * - weekly-error         '2026-07-20' 주 첫 조회만 실패(재시도는 성공) — P9 인라인 에러
 * - weekly-out-of-range  가입 주 이전 토큰이 내려와 STATS_WEEK_OUT_OF_RANGE — 무노출·표시 주 유지 검증
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import { getInterestMockSummary } from '@/features/interest';

import type {
  ProfileCareerDto,
  ProfilePlanDto,
  ProfileSummaryResponseDto,
  ProfileUserDto,
  WeeklyListeningResponseDto,
} from './profile.dto';

const SCENARIO = process.env.EXPO_PUBLIC_PROFILE_MOCK_SCENARIO ?? 'default';

/** 스켈레톤 0.3초 규칙(useDelayedVisible)이 실제로 노출되는 지연 — explore mock과 동일 값 */
const RESPONSE_DELAY_MS = 600;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/* ── 주간 청취 — 이번 주 포함 5주. 배열 이웃이 prev/next 토큰이 된다(토큰은 클라이언트에 불투명) ── */

/**
 * 인덱스 0이 이번 주, 마지막이 가입 주다.
 * '2026-07-20'은 60분 이상 값(a11y "N시간 N분" 검증), '2026-07-13'은 전체 0(과거 주 빈 문구 검증).
 */
const WEEKS: { weekStart: string; daily: number[] }[] = [
  { weekStart: '2026-08-03', daily: [1220, 0, 845, 0, 0, 0, 0] },
  { weekStart: '2026-07-27', daily: [0, 3600, 0, 1800, 0, 0, 900] },
  { weekStart: '2026-07-20', daily: [7200, 5400, 860, 0, 12600, 3660, 0] },
  { weekStart: '2026-07-13', daily: [0, 0, 0, 0, 0, 0, 0] },
  { weekStart: '2026-07-06', daily: [600, 0, 0, 0, 0, 0, 300] },
];

const EMPTY_WEEK: { weekStart: string; daily: number[] } = {
  weekStart: '2026-08-03',
  daily: [0, 0, 0, 0, 0, 0, 0],
};

/** stats-empty는 가입 주 = 이번 주 한 주뿐이다 */
const weeksForScenario = (): { weekStart: string; daily: number[] }[] =>
  SCENARIO === 'stats-empty' ? [EMPTY_WEEK] : WEEKS;

const toWeeklyDtoAt = (index: number): WeeklyListeningResponseDto => {
  const weeks = weeksForScenario();
  const week = weeks[index];
  const previous = weeks[index + 1]?.weekStart ?? null;
  return {
    week_start: week.weekStart,
    daily_listened_sec: week.daily,
    // 가입 주 이전을 가리키는 토큰이 내려오는 서버 결함의 재현 — 클라이언트의 방어(무노출 유지)를 검증한다
    previous_week_start:
      previous === null && SCENARIO === 'weekly-out-of-range' ? '2026-06-29' : previous,
    next_week_start: weeks[index - 1]?.weekStart ?? null,
  };
};

/* ── 프로필 요약 — 시나리오별 조립 ── */

const USER_BASE: ProfileUserDto = {
  nickname: '수현',
  provider: 'kakao',
  email: 'user@example.com',
  is_email_verified: true,
};

const PLAN_SUBSCRIBED: ProfilePlanDto = {
  status: 'subscribed',
  tier: 'pro',
  plan_name: '프로',
  daily_play_limit: null,
  renews_at: '2026-09-01T00:00:00Z',
  expires_at: null,
  has_payment_issue: false,
};

const planForScenario = (): ProfilePlanDto => {
  switch (SCENARIO) {
    case 'free':
      // 한도를 2가 아닌 값으로 둔다 — 화면이 "하루 2편"을 하드코딩하면 여기서 드러난다(paywall.md 5장)
      return {
        status: 'free',
        tier: 'light',
        plan_name: '무료',
        daily_play_limit: 3,
        renews_at: null,
        expires_at: null,
        has_payment_issue: false,
      };
    case 'cancel-scheduled':
      return {
        ...PLAN_SUBSCRIBED,
        status: 'cancel_scheduled',
        renews_at: null,
        expires_at: '2026-08-31T00:00:00Z',
      };
    case 'grace':
      return { ...PLAN_SUBSCRIBED, status: 'grace', renews_at: null, has_payment_issue: true };
    default:
      return PLAN_SUBSCRIBED;
  }
};

const userForScenario = (): ProfileUserDto => {
  switch (SCENARIO) {
    case 'email-unverified':
      return { ...USER_BASE, is_email_verified: false };
    case 'email-unregistered':
      return { ...USER_BASE, email: null, is_email_verified: false };
    default:
      return USER_BASE;
  }
};

const careerForScenario = (): ProfileCareerDto =>
  SCENARIO === 'career-empty'
    ? { job_category: null, job_title: null, years_of_experience: null }
    : { job_category: '기획', job_title: '서비스 기획', years_of_experience: '4-6' };

export const mockFetchProfileSummary = async (): Promise<ProfileSummaryResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  if (SCENARIO === 'full-error') {
    // 재시도 지연이 없게 retryable=false로 둔다(explore mock과 동일한 태도)
    throw new ApiError(
      ERROR_CODES.INTERNAL_ERROR,
      '일시적인 오류가 발생했어요',
      false,
      null,
      null,
      500,
    );
  }

  const statsEmpty = SCENARIO === 'stats-empty';
  const statsFailed = SCENARIO === 'stats-error';
  const planFailed = SCENARIO === 'partial-error';

  return {
    user: userForScenario(),
    plan: planFailed ? null : planForScenario(),
    // 관심사 원본은 interest mock 하나다 — 카드와 편집 화면(관심사 관리)이 같은 상태를 읽는다.
    // "+2"(외 N개)는 EXPO_PUBLIC_INTEREST_MOCK_SCENARIO=over-limit(5개 보유)과 조합해 본다
    interest_summary: getInterestMockSummary(),
    career: careerForScenario(),
    stats_summary: statsFailed
      ? null
      : statsEmpty
        ? { completed_content_count: 0, total_listened_sec: 0, streak_days: 0 }
        : { completed_content_count: 12, total_listened_sec: 45120, streak_days: 5 },
    weekly_listening: statsFailed ? null : toWeeklyDtoAt(0),
    topic_distribution: statsFailed
      ? null
      : statsEmpty
        ? { topics: [], others_ratio: 0 }
        : {
            topics: [
              { topic_id: 'topic-career', name: '커리어', ratio: 38 },
              { topic_id: 'topic-selfdev', name: '자기계발', ratio: 24 },
              { topic_id: 'topic-economy', name: '경제', ratio: 15 },
              { topic_id: 'topic-tech', name: 'IT·테크', ratio: 10 },
              { topic_id: 'topic-psychology', name: '심리', ratio: 7 },
            ],
            others_ratio: 6,
          },
    failed_sections: planFailed ? ['plan'] : statsFailed ? ['stats'] : [],
  };
};

/* ── 이전 주차 조회 ── */

/** weekly-error 시나리오 — 같은 주의 재시도는 성공해야 [다시 시도] 경로가 검증된다 */
let hasWeeklyErrorFired = false;

export const mockFetchWeeklyListening = async (
  weekStart: string,
): Promise<WeeklyListeningResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  // 서버 검증의 대역(profile-api.md 4.2 에러) — 정상 UI는 토큰을 그대로 보내므로 여기 도달하지 않는다
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    throw new ApiError(
      ERROR_CODES.VALIDATION_FAILED,
      '요청이 올바르지 않아요',
      false,
      null,
      null,
      400,
    );
  }

  if (SCENARIO === 'weekly-error' && weekStart === '2026-07-20' && !hasWeeklyErrorFired) {
    hasWeeklyErrorFired = true;
    throw new ApiError(
      ERROR_CODES.INTERNAL_ERROR,
      '일시적인 오류가 발생했어요',
      false,
      null,
      null,
      500,
    );
  }

  const index = weeksForScenario().findIndex((week) => week.weekStart === weekStart);
  if (index === -1) {
    // 가입 주 이전·미래 주 — 방어적 거절. 클라이언트는 무노출로 현재 표시 주를 유지한다
    throw new ApiError(
      ERROR_CODES.STATS_WEEK_OUT_OF_RANGE,
      '조회할 수 없는 주예요',
      false,
      null,
      null,
      400,
    );
  }
  return toWeeklyDtoAt(index);
};
