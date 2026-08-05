import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';

import { fetchFirstDripState, onboardingKeys } from '../api/onboarding.api';
import { FIRST_DRIP_MAX_WAIT_FALLBACK_SEC } from '../onboarding.constants';
import type { OnboardingStackParamList } from '../onboarding.types';
import { onboardingCompletionService } from '../services/onboarding-completion.service';
import { useOnboardingStore } from '../store/onboarding.store';

/**
 * O13 완료 대기 — 0건 담기 경로 전용. 어느 갈래로 나가든 완료 화면에 도달한다(onboarding-api.md 6).
 * 로딩 화면이 종점이 되는 경로는 없다: 종료 상태·대기 상한 초과 모두 완료 화면으로 진행한다.
 */
export const useFirstDripWaitingScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList, 'FirstDripWaiting'>>();
  const completionStatus = useOnboardingStore((s) => s.completionStatus);
  const completionResult = useOnboardingStore((s) => s.completionResult);
  const hasFinishedRef = useRef(false);

  // 뒤로가기 차단 — 3단계로 되돌리면 이미 완료 처리된 온보딩을 다시 진행하는 모순 상태가 된다(onboarding.md 7)
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => subscription.remove();
    }, []),
  );

  const goComplete = useCallback(() => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    navigation.reset({ index: 0, routes: [{ name: 'Complete' }] });
  }, [navigation]);

  const awaitsFirstDrip =
    completionStatus === 'success' && completionResult?.awaitsFirstDrip === true;
  const pollIntervalSec = completionResult?.firstDrip?.pollIntervalSec ?? 1;
  const maxWaitSec = completionResult?.firstDrip?.maxWaitSec ?? FIRST_DRIP_MAX_WAIT_FALLBACK_SEC;

  // 폴링 간격·대기 상한은 서버가 내려준 값을 쓴다 — 클라이언트에 하드코딩하지 않는다(onboarding-api.md 2)
  const firstDripQuery = useQuery({
    queryKey: onboardingKeys.firstDrip(),
    queryFn: fetchFirstDripState,
    enabled: awaitsFirstDrip && completionResult?.firstDrip?.status === 'pending',
    gcTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === undefined || status === 'pending' ? pollIntervalSec * 1_000 : false;
    },
  });

  // 완료 응답·폴링 결과와 화면 전환을 동기화한다
  useEffect(() => {
    if (completionStatus !== 'success') return;

    // 1건 이상 담은 경로가 잘못 들어온 경우 포함 — 대기 없이 곧바로 완료 화면(onboarding-api.md 4.7)
    if (!awaitsFirstDrip) {
      goComplete();
      return;
    }
    // 완료 시점에 이미 편성이 끝났거나(completed) 기다릴 이유가 없는 상태(no_candidates·queued)
    if (completionResult?.firstDrip && completionResult.firstDrip.status !== 'pending') {
      goComplete();
      return;
    }
    // 폴링 종료 상태 — completed·no_candidates·queued 전부 완료 화면으로 진행한다(onboarding-api.md 4.8)
    const polledStatus = firstDripQuery.data?.status;
    if (polledStatus !== undefined && polledStatus !== 'pending') {
      goComplete();
    }
  }, [completionStatus, awaitsFirstDrip, completionResult, firstDripQuery.data, goComplete]);

  // 대기 상한 초과 시 status와 무관하게 진행한다 — 사용자를 로딩 화면에 가두지 않는다(onboarding.md 4 [완료])
  useEffect(() => {
    if (!awaitsFirstDrip) return;
    const timer = setTimeout(goComplete, maxWaitSec * 1_000);
    return () => clearTimeout(timer);
  }, [awaitsFirstDrip, maxWaitSec, goComplete]);

  return {
    /** 완료 요청 자체가 재시도 소진으로 실패한 상태 — 전체 화면 에러 + [다시 시도](onboarding-api.md 5장) */
    isCompletionFailed: completionStatus === 'error',
    /** 0.3초 미만이면 로딩을 표시하지 않는다(onboarding-uiux.md 4.5) */
    showLoading: useDelayedVisible(completionStatus !== 'error'),
    handleRetryPress: () => onboardingCompletionService.request(),
  };
};
