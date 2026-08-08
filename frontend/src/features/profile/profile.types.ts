/**
 * 프로필 화면 모델(camelCase) — 계약(profile-api.md 4장)의 화면 표현이다.
 * 프로필은 읽기 전용 요약 화면이라 쓰기 모델이 없다(profile.md 1장).
 */
import type { SocialProvider } from '@/features/auth';
import type { YearsOfExperience } from '@/features/onboarding';

// 원 정의는 온보딩 커리어 단계(career.md 3장) — profile 내부 파일은 여기서 가져다 쓴다
export type { YearsOfExperience };

/**
 * 서버가 subscriptions 기준으로 정규화한 4분기(profile-api.md 4.1) — raw enum이 아니다.
 * 클라이언트가 expires_at과 기기 시각으로 재판정하지 않는다.
 * 소유는 subscription-api 작성 시 그쪽으로 이관 예정(profile-api.md 9장).
 */
export type PlanStatus = 'free' | 'subscribed' | 'cancel_scheduled' | 'grace';

/** email × isEmailVerified 조합의 세 상태(profile.md 4.3) — 파생은 profile.format.ts가 한다 */
export type EmailStatus = 'unregistered' | 'unverified' | 'verified';

export interface ProfileUser {
  nickname: string;
  provider: SocialProvider;
  /** null이면 미등록 — isEmailVerified와 항상 함께 판정한다(profile-api.md 4.1) */
  email: string | null;
  isEmailVerified: boolean;
}

export interface ProfilePlan {
  status: PlanStatus;
  tier: string;
  planName: string;
  /** 무료 카드 "하루 N편"의 N — 서버 값이다. null은 무제한(한도를 적지 않는다) */
  dailyPlayLimit: number | null;
  /** subscribed일 때 다음 결제일 — expiresAt과 원천은 같지만 의미가 달라 필드가 나뉜다 */
  renewsAt: string | null;
  /** cancel_scheduled일 때 이용 종료일 */
  expiresAt: string | null;
  hasPaymentIssue: boolean;
}

export interface ProfileTopic {
  id: string;
  name: string;
}

export interface InterestSummary {
  /** 항상 1 이상 — 편집 화면이 최소 1개를 강제한다(profile.md 4.4) */
  count: number;
  /** 최대 3개 — 서버 응답 순서의 앞 3개, 별도 선정 기준 없음(확정 2026-08-06) */
  topTopics: ProfileTopic[];
}

/** 세 값 모두 선택 입력 — 전부 null이면 카드가 미입력 변형이다(profile-uiux.md 4.5) */
export interface ProfileCareer {
  jobCategory: string | null;
  jobTitle: string | null;
  yearsOfExperience: YearsOfExperience | null;
}

export interface StatsSummary {
  /** 완청한 고유 콘텐츠 수 — 같은 콘텐츠 여러 번 완청해도 1편 */
  completedContentCount: number;
  totalListenedSec: number;
  /** 서버 판정 값 그대로 표시한다 — "오늘 안 들었으니 0" 재판정 금지(profile.md 4.5) */
  streakDays: number;
}

/** 4.1의 weekly_listening과 4.2 응답이 같은 모양이라 타입 하나다(profile-api.md 4.2) */
export interface WeeklyListening {
  /** 그 주 월요일의 YYYY-MM-DD 라벨 — 주 경계(월 04:00 KST) 판정은 서버 몫 */
  weekStart: string;
  /** 월~일 7개 고정 배열(초). 기록 없는 요일·아직 오지 않은 요일도 0으로 자리 유지 */
  dailyListenedSec: number[];
  /** null이면 가입 주 — [◀] 비활성. 값은 다음 조회의 week_start로 그대로 쓴다 */
  previousWeekStart: string | null;
  /** null이면 이번 주 — [▶] 비활성 */
  nextWeekStart: string | null;
}

export interface TopicShare {
  topicId: string;
  name: string;
  /** 정수 %. 합 100 조정까지 서버가 한다 — 재정규화·재정렬 금지(profile-api.md 4.1) */
  ratio: number;
}

export interface TopicDistribution {
  /** 상위 5개(비율 내림차순). 기록 없으면 빈 배열 */
  topics: TopicShare[];
  othersRatio: number;
}

/** 부분 실패 대상 키 — stats 하나가 통계 3영역을 묶는다(profile-api.md 4.1) */
export type ProfileFailedSection = 'plan' | 'interest_summary' | 'stats';

export interface ProfileSummary {
  user: ProfileUser;
  /** null + failedSections에 'plan' = 섹션 조회 실패. "값이 없음"과 구분된다 */
  plan: ProfilePlan | null;
  interestSummary: InterestSummary | null;
  /** user와 같은 행에서 오므로 부분 실패 대상이 아니다(profile-api.md 4.1) */
  career: ProfileCareer;
  statsSummary: StatsSummary | null;
  weeklyListening: WeeklyListening | null;
  topicDistribution: TopicDistribution | null;
  failedSections: ProfileFailedSection[];
}
