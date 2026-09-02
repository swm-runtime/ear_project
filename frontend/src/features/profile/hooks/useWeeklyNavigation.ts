import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import { profileKeys, weeklyListeningQueryOptions } from '../api/profile.api';
import { PROFILE_COPY } from '../profile.copy';
import type { WeeklyListening } from '../profile.types';

export interface WeeklyNavigation {
  /** 그리는 주의 데이터 — 이번 주면 요약 응답 값 그대로다. 로딩 전엔 null */
  displayed: WeeklyListening | null;
  /** 주 범위 라벨의 기준 — 이동 중·실패 시에는 이동하려던 주를 유지한다(profile-uiux.md 4.7) */
  weekLabelStart: string | null;
  /** 주 이동 중 — 그래프 자리만 스켈레톤, 요약·분포는 그대로(profile-uiux.md 4.7) */
  isSwitching: boolean;
  /** 주 단위 조회 실패 — 그래프 자리 인라인 에러 + [다시 시도] */
  hasSwitchError: boolean;
  retrySwitch: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  goPrev: () => void;
  goNext: () => void;
  /**
   * 막대 탭 말풍선(changes/pending profile-uiux-weekly-bar-tooltip) — 표시 중인 주의 선택
   * 요일. 재탭·주 이동·그래프 밖 탭에서 해제된다. 해제 지점이 화면(그래프 밖 탭)과 그래프
   * (막대·화살표)에 걸쳐 있어 상태를 이 훅이 소유한다
   */
  selectedBarIndex: number | null;
  toggleBar: (dayIndex: number) => void;
  clearBarTooltip: () => void;
}

/**
 * 주간 그래프의 주 이동 상태기계(profile.md 4.6 · profile-api.md 4.2).
 *
 * 이동은 명령형 선조회다(explore switchPopularPeriod 선례) — fetchQuery가 성공했을 때만 표시 주를
 * 옮기므로, 실패 시 표시 주·화살표가 직전 정상 응답 기준으로 남는 "롤백"이 상태 되돌리기 없이 성립한다.
 * 이동 대상은 항상 서버가 준 previous/next_week_start 토큰이다 — 클라이언트 날짜 연산 0.
 */
export const useWeeklyNavigation = (summaryWeekly: WeeklyListening | null): WeeklyNavigation => {
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  /** null = 이번 주(요약 응답 소유). 값이 있으면 그 주의 캐시를 구독한다 */
  const [displayedWeekStart, setDisplayedWeekStart] = useState<string | null>(null);
  /** 인플라이트 가드 — 값이 있는 동안 화살표 연타를 무시한다 */
  const [pendingWeekStart, setPendingWeekStart] = useState<string | null>(null);
  const [failedWeekStart, setFailedWeekStart] = useState<string | null>(null);
  /** 말풍선 선택 — 주 기준으로 저장해 주가 다르면 파생 판정에서 무시된다(effect 없이 해제) */
  const [selectedBar, setSelectedBar] = useState<{ weekStart: string; dayIndex: number } | null>(
    null,
  );

  // 확정된 과거 주만 구독한다 — staleTime Infinity라 fetchQuery가 채운 캐시를 그대로 읽는다.
  // 빈 문자열 키는 enabled 가드로 조회되지 않는다(이번 주 표시 중의 자리 값)
  const pastWeekQuery = useQuery({
    ...weeklyListeningQueryOptions(displayedWeekStart ?? ''),
    enabled: displayedWeekStart !== null,
  });

  const displayed = displayedWeekStart === null ? summaryWeekly : (pastWeekQuery.data ?? null);

  // 화면 이탈 시 이번 주로 리셋하고 받아둔 주를 폐기한다 — 주 위치는 저장할 상태가 아니고,
  // "화면을 벗어나기 전까지"가 캐시의 수명이다(profile.md 4.6).
  // 이벤트 콜백의 setState라 effect 동기 setState 규칙(react-hooks/set-state-in-effect)에 걸리지 않는다
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      setDisplayedWeekStart(null);
      setPendingWeekStart(null);
      setFailedWeekStart(null);
      setSelectedBar(null);
      queryClient.removeQueries({ queryKey: profileKeys.weeklyAll() });
    });
    return unsubscribe;
  }, [navigation, queryClient]);

  const moveToWeek = (weekStart: string | null): void => {
    if (weekStart === null || pendingWeekStart !== null) return;
    // 주를 이동하면 말풍선을 해제한다 — 같은 주로 되돌아와도 다시 나타나지 않는다
    setSelectedBar(null);
    setFailedWeekStart(null);
    setPendingWeekStart(weekStart);
    queryClient
      .fetchQuery(weeklyListeningQueryOptions(weekStart))
      .then((week) => {
        // 이동 중 화면을 떠났으면 결과를 버린다 — blur 리셋을 늦게 도착한 응답이 덮지 않게
        if (!navigation.isFocused()) return;
        setDisplayedWeekStart(weekStart);
        // 그래프 갱신을 스크린리더에 알린다(profile-uiux.md 7장 aria-live polite의 RN 대응)
        AccessibilityInfo.announceForAccessibility(PROFILE_COPY.stats.weeklyA11y(week.weekStart));
      })
      .catch((error: unknown) => {
        if (!navigation.isFocused()) return;
        // 방어적 거절(가입 주 이전·미래 주) — 사용자에게 노출하지 않는다. 표시 주를 옮기지
        // 않았으므로 "직전 정상 응답 기준 유지"가 자동이다(profile-api.md 5장)
        if (isApiError(error) && error.errorCode === ERROR_CODES.STATS_WEEK_OUT_OF_RANGE) return;
        setFailedWeekStart(weekStart);
      })
      .finally(() => {
        setPendingWeekStart(null);
      });
  };

  const goPrev = (): void => {
    moveToWeek(displayed?.previousWeekStart ?? null);
  };

  const goNext = (): void => {
    const token = displayed?.nextWeekStart ?? null;
    if (token === null || pendingWeekStart !== null) return;
    // 이번 주 라벨이면 재조회 없이 요약 값으로 돌아간다 — 첫 표시의 소유자는 4.1이다(profile-api.md 4.2)
    if (summaryWeekly !== null && token === summaryWeekly.weekStart) {
      setDisplayedWeekStart(null);
      setFailedWeekStart(null);
      setSelectedBar(null);
      AccessibilityInfo.announceForAccessibility(PROFILE_COPY.stats.weeklyA11y(token));
      return;
    }
    moveToWeek(token);
  };

  const retrySwitch = (): void => {
    moveToWeek(failedWeekStart);
  };

  const selectedBarIndex =
    selectedBar !== null && displayed !== null && selectedBar.weekStart === displayed.weekStart
      ? selectedBar.dayIndex
      : null;

  const toggleBar = (dayIndex: number): void => {
    if (displayed === null) return;
    setSelectedBar(
      selectedBarIndex === dayIndex ? null : { weekStart: displayed.weekStart, dayIndex },
    );
  };

  const clearBarTooltip = (): void => {
    setSelectedBar(null);
  };

  return {
    displayed,
    weekLabelStart: failedWeekStart ?? pendingWeekStart ?? displayed?.weekStart ?? null,
    isSwitching: pendingWeekStart !== null,
    hasSwitchError: failedWeekStart !== null,
    retrySwitch,
    // 활성 판정은 서버 토큰의 null 여부뿐이다 — "가입 주" 판정은 서버가 한다(profile-api.md 4.2)
    canGoPrev: displayed?.previousWeekStart != null,
    canGoNext: displayed?.nextWeekStart != null,
    goPrev,
    goNext,
    selectedBarIndex,
    toggleBar,
    clearBarTooltip,
  };
};
