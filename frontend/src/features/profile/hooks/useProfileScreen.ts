import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';

import { profileKeys } from '../api/profile.api';
import { isCareerEmpty, toInterestOverflowCount } from '../profile.format';
import type {
  ProfileCareer,
  ProfileFailedSection,
  ProfilePlan,
  ProfileTopic,
  StatsSummary,
  TopicDistribution,
} from '../profile.types';
import { useProfileSummaryQuery } from './useProfileSummaryQuery';
import { useWeeklyNavigation, type WeeklyNavigation } from './useWeeklyNavigation';

/** 카드·통계 영역의 3상 — null(로딩 중)은 스켈레톤이 덮으므로 상태에 넣지 않는다 */
export type SectionState<T> = { kind: 'data'; data: T } | { kind: 'error' };

/**
 * 플랜 카드 VM — 서버가 정규화한 status 4분기를 그대로 실어 나른다(profile-api.md 4.1).
 * 클라이언트가 expires_at과 기기 시각으로 재판정하지 않는다.
 */
export type PlanCardVM =
  | { kind: 'free'; dailyPlayLimit: number | null }
  | { kind: 'subscribed'; planName: string; renewsAt: string | null }
  | { kind: 'cancelScheduled'; planName: string; expiresAt: string | null }
  | { kind: 'grace'; planName: string };

export interface InterestCardVM {
  count: number;
  topTopics: ProfileTopic[];
  /** "+N" — 없으면 null(상한 도입 이전 초과 보유자에게만 나타난다) */
  overflowCount: number | null;
}

export interface CareerCardVM {
  career: ProfileCareer;
  isEmpty: boolean;
}

/** 통계 3영역은 'stats' 하나로 함께 성공·실패한다(profile-api.md 4.1). 주간 그래프는 weekly가 소유 */
export interface StatsVM {
  summary: StatsSummary;
  distribution: TopicDistribution;
}

const toPlanCardVM = (plan: ProfilePlan): PlanCardVM => {
  switch (plan.status) {
    case 'free':
      return { kind: 'free', dailyPlayLimit: plan.dailyPlayLimit };
    case 'subscribed':
      return { kind: 'subscribed', planName: plan.planName, renewsAt: plan.renewsAt };
    case 'cancel_scheduled':
      return { kind: 'cancelScheduled', planName: plan.planName, expiresAt: plan.expiresAt };
    case 'grace':
      return { kind: 'grace', planName: plan.planName };
  }
};

/** 카드 탭·설정 아이콘의 목적지 — 전부 MainStack 위에 얹히는 화면들이다(현재 placeholder) */
type ProfileDestination = 'Settings' | 'Subscription' | 'InterestManagement' | 'Career';

export const useProfileScreen = () => {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const query = useProfileSummaryQuery();
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  /**
   * 프로필발 push 표시 — 하위 화면에서 [취소]·뒤로가기로 복귀한 focus에 재조회를 붙이지 않기
   * 위한 1회성 플래그다(profile-uiux.md 4.9). 저장 복귀의 갱신은 편집 화면이 저장 성공 시
   * invalidateQueries(profileKeys.summary())를 호출하는 계약으로 해결된다(index.ts 주석).
   * 접근이 전부 이벤트·콜백 시점이라 렌더 중 ref 규칙(react-hooks/refs)에 걸리지 않는다.
   */
  const suppressFocusRefetchRef = useRef(false);

  // 탭 재진입마다 조용히 재조회한다 — 다른 기기의 변경을 흡수한다(profile-api.md 6장).
  // 데이터가 있는 invalidate는 기존 값을 유지한 채 백그라운드 갱신이라 스켈레톤이 다시 뜨지 않는다
  useFocusEffect(
    useCallback(() => {
      if (suppressFocusRefetchRef.current) {
        suppressFocusRefetchRef.current = false;
        return;
      }
      // 첫 진입의 조회는 useQuery 마운트가 담당한다 — 중복 조회를 만들지 않는다
      if (queryClient.getQueryData(profileKeys.summary()) === undefined) return;
      void queryClient.invalidateQueries({ queryKey: profileKeys.summary() });
    }, [queryClient]),
  );

  const summary = query.data;
  const isFullError = query.isError;

  const hasFailed = useCallback(
    (section: ProfileFailedSection): boolean => summary?.failedSections.includes(section) ?? false,
    [summary],
  );

  /* ── 섹션별 상태 — 부분 실패는 해당 카드만 에러로 둔다(P7) ── */

  const planCard: SectionState<PlanCardVM> | null = useMemo(() => {
    if (summary) {
      return hasFailed('plan') || summary.plan === null
        ? { kind: 'error' }
        : { kind: 'data', data: toPlanCardVM(summary.plan) };
    }
    return isFullError ? { kind: 'error' } : null;
  }, [summary, hasFailed, isFullError]);

  const interestCard: SectionState<InterestCardVM> | null = useMemo(() => {
    if (summary) {
      return hasFailed('interest_summary') || summary.interestSummary === null
        ? { kind: 'error' }
        : {
            kind: 'data',
            data: {
              count: summary.interestSummary.count,
              topTopics: summary.interestSummary.topTopics,
              overflowCount: toInterestOverflowCount(summary.interestSummary),
            },
          };
    }
    return isFullError ? { kind: 'error' } : null;
  }, [summary, hasFailed, isFullError]);

  // career도 user와 같은 행 — 부분 실패 대상이 아니다
  const careerCard: SectionState<CareerCardVM> | null = useMemo(() => {
    if (summary) {
      return {
        kind: 'data',
        data: { career: summary.career, isEmpty: isCareerEmpty(summary.career) },
      };
    }
    return isFullError ? { kind: 'error' } : null;
  }, [summary, isFullError]);

  const stats: SectionState<StatsVM> | null = useMemo(() => {
    if (summary) {
      return hasFailed('stats') ||
        summary.statsSummary === null ||
        summary.topicDistribution === null
        ? { kind: 'error' }
        : {
            kind: 'data',
            data: { summary: summary.statsSummary, distribution: summary.topicDistribution },
          };
    }
    return isFullError ? { kind: 'error' } : null;
  }, [summary, hasFailed, isFullError]);

  const weekly: WeeklyNavigation = useWeeklyNavigation(summary?.weeklyListening ?? null);

  /* ── 재조회 3종 — [다시 시도](전체)·당겨서 새로고침·조용한 갱신(focus)을 구분한다 ── */

  const retry = (): void => {
    // 연타는 인플라이트 요청이 있으면 무시한다(profile-uiux.md 4.9)
    if (query.isFetching) return;
    void query.refetch();
  };

  const refresh = (): void => {
    if (isManualRefreshing) return;
    setIsManualRefreshing(true);
    void query.refetch().finally(() => setIsManualRefreshing(false));
  };

  /* ── 내비게이션 — 프로필은 요약과 진입점만 소유한다(profile.md 1장) ── */

  const openDestination = (destination: ProfileDestination): void => {
    suppressFocusRefetchRef.current = true;
    navigation.navigate('Main', { screen: destination });
  };

  return {
    /** 최초 조회 스켈레톤 여부는 화면이 useDelayedVisible(0.3초 규칙)로 감싼다 */
    isInitialLoading: query.isPending,
    /** 헤더 — 전체 실패 시 null(닉네임 자리 비움). 설정 아이콘은 이 값과 무관하게 항상 노출 */
    header: summary
      ? {
          nickname: summary.user.nickname,
          provider: summary.user.provider,
          email: summary.user.email,
          isEmailVerified: summary.user.isEmailVerified,
        }
      : null,
    planCard,
    interestCard,
    careerCard,
    stats,
    weekly,
    retry,
    isRetrying: query.isFetching && !isManualRefreshing,
    refresh,
    isManualRefreshing,
    openSettings: () => openDestination('Settings'),
    openPlan: () => openDestination('Subscription'),
    // A10의 "현재 이메일" 표시 값을 실어 보낸다 — 설정 경로와 같은 방식(auth.md 4.5 공통 화면)
    openEmail: () =>
      navigation.navigate('Main', {
        screen: 'EmailVerification',
        params: { currentEmail: summary?.user.email ?? null },
      }),
    openInterests: () => openDestination('InterestManagement'),
    openCareer: () => openDestination('Career'),
  };
};
