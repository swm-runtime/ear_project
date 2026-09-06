import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { BackHandler } from 'react-native';

import { logger } from '@/shared/lib/logger';

import { useTopicsQuery } from '@/features/interest';
import { getOsPermissionStatus, useNotificationStore } from '@/features/notification';

import { onboardingCompletionService } from '../services/onboarding-completion.service';
import { exitOnboarding } from '../services/onboarding-exit.service';
import { useOnboardingStore } from '../store/onboarding.store';

/**
 * O9 완료 — 완료 요청은 3단계 종료 시점에 이미 나갔다(onboarding-uiux.md 4.6).
 * 1건 이상 경로에서는 요청이 아직 인플라이트인 채로 이 화면이 떠 있을 수 있으므로
 * [시작하기]를 버튼 로딩 상태로 두고 중복 탭을 차단한다.
 */
export const useCompleteScreen = () => {
  const topicsQuery = useTopicsQuery();
  const markPrePromptPending = useNotificationStore((s) => s.markPrePromptPending);
  const selectedTopicIds = useOnboardingStore((s) => s.selectedTopicIds);
  const completionStatus = useOnboardingStore((s) => s.completionStatus);
  const [isRouting, setIsRouting] = useState(false);

  // 뒤로가기로 3단계에 돌아가지 못한다(onboarding-uiux.md 4.6)
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => subscription.remove();
    }, []),
  );

  // 선택한 주제를 칩으로 그대로 되비춘다 — 이름은 주제 목록 캐시에서 찾는다
  const topicNames = selectedTopicIds
    .map((id) => topicsQuery.data?.items.find((topic) => topic.topicId === id)?.name)
    .filter((name): name is string => name !== undefined);

  const isProcessing = completionStatus === 'pending' || isRouting;

  const handleStartPress = async () => {
    if (isProcessing) return;
    // 완료 요청이 실패해 있으면 [시작하기]가 재시도를 겸한다 — 완료 처리 없이 진행하면
    // 다음 실행에서 온보딩이 되살아난다(서버 재개 지점이 pick에 머문다)
    if (completionStatus === 'error') {
      onboardingCompletionService.request();
      return;
    }

    setIsRouting(true);
    try {
      /*
       * 알림 사전 안내는 더 이상 온보딩의 마지막 화면이 아니다 — 라이브러리에 들어간 뒤
       * 모달로 띄운다(2026-09-02). 여기서는 "띄워야 한다"는 신호만 세우고 나간다.
       * 이미 OS 권한이 허용된 상태(재설치 등)면 신호를 세우지 않는다(onboarding-uiux.md 4.7).
       */
      const permissionStatus = await getOsPermissionStatus();
      if (permissionStatus !== 'granted') {
        markPrePromptPending();
      }
    } catch (error) {
      // 상태를 못 읽었으면 띄우는 쪽으로 판단한다 — 안 띄우면 다시 물을 자리가 설정뿐이다
      logger.warn('[onboarding] permission status check failed, showing pre-prompt', error);
      markPrePromptPending();
    } finally {
      setIsRouting(false);
    }
    exitOnboarding();
  };

  return {
    topicNames,
    completionStatus,
    isProcessing,
    handleStartPress,
  };
};
