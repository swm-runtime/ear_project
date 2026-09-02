import { InterestSummaryView } from '@/modules/interest/interest.types';
import { PlanView } from '@/modules/subscription/subscription.types';
import { SocialProvider } from '@/modules/user/user.enum';
import { YearsOfExperienceRange } from '@/modules/user/user.enum';

import { ProfileSection } from './profile.enum';

/** convention.md 3.2 — Controller ↔ Orchestrator 경계 밖의 내부 타입 */

/** 헤더 — 표시 전용이다. 편집 진입점이 없다(`profile-api.md` 4.1) */
export interface ProfileUserView {
  nickname: string | null;
  provider: SocialProvider;
  /**
   * **`null`은 "등록되지 않음"이다.** 값이 있는데 `isEmailVerified = false`면
   * "인증되지 않음" 배지 상태다 — 한쪽만으로는 세 상태를 구분할 수 없어 항상 함께 내려준다.
   */
  email: string | null;
  isEmailVerified: boolean;
}

export interface ProfileTopicView {
  id: string;
  name: string;
}

/** 커리어 요약 — 세 값 모두 선택 입력이라 미입력이면 `null`이다 */
export interface ProfileCareerView {
  jobCategory: string | null;
  jobTitle: string | null;
  yearsOfExperience: YearsOfExperienceRange | null;
}

/** 누적 3지표(`profile.md` 4.5). 기록이 없으면 셋 다 0이며 **실패가 아니다** */
export interface ProfileStatsSummaryView {
  completedContentCount: number;
  totalListenedSec: number;
  streakDays: number;
}

/** 주간 그래프 한 주(`profile.md` 4.6). 4.1과 4.2가 **같은 모양**을 쓴다 */
export interface WeeklyListeningView {
  /** 그 주 월요일의 `YYYY-MM-DD` 라벨 */
  weekStart: string;
  /** 월~일 **7개 고정 배열**. 기록 없는 요일도 0으로 자리를 유지한다 */
  dailyListenedSec: number[];
  /** `null`이면 이전 주가 없다(가입 주) → 화면이 [◀]를 비활성화한다 */
  previousWeekStart: string | null;
  /** `null`이면 이번 주다 → [다음 주 ▶] 비활성 */
  nextWeekStart: string | null;
}

export interface TopicDistributionItemView {
  topicId: string;
  name: string;
  /** 정수 비율. 상위 5개 + `othersRatio`의 합이 정확히 100이다 */
  ratio: number;
}

/** 주제 분포(`profile.md` 4.7). 기록이 없으면 `topics: []` · `othersRatio: 0` */
export interface TopicDistributionView {
  topics: TopicDistributionItemView[];
  othersRatio: number;
}

/**
 * 프로필 요약 한 번의 응답(`profile-api.md` 4.1).
 *
 * **섹션 실패는 `null` + `failedSections`로 표현한다.** `null`만으로는 "값이 없음"
 * (이메일 미등록·커리어 미입력·기록 없음)과 구분되지 않는다.
 */
export interface ProfileSummaryResult {
  user: ProfileUserView;
  plan: PlanView | null;
  interestSummary: InterestSummaryView | null;
  career: ProfileCareerView;
  statsSummary: ProfileStatsSummaryView | null;
  weeklyListening: WeeklyListeningView | null;
  topicDistribution: TopicDistributionView | null;
  failedSections: ProfileSection[];
}
