import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { useToastStore } from '@/shared/ui/toast.store';

import { ONBOARDING_COPY } from '../onboarding.copy';
import type { OnboardingStackParamList } from '../onboarding.types';
import { useOnboardingTopicsQuery } from './useOnboardingTopicsQuery';
import { useSaveInterestsMutation } from './useSaveInterestsMutation';
import { useOnboardingStore } from '../store/onboarding.store';

export const useTopicSelectScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList, 'Topic'>>();
  const showToast = useToastStore((s) => s.show);
  const topicsQuery = useOnboardingTopicsQuery();
  const saveInterestsMutation = useSaveInterestsMutation();
  const selectedTopicIds = useOnboardingStore((s) => s.selectedTopicIds);
  const setSelectedTopicIds = useOnboardingStore((s) => s.setSelectedTopicIds);

  // 1단계에서 더 뒤로는 아무 동작도 하지 않는다 — 이탈 확인 팝업도 띄우지 않는다(onboarding.md 7)
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => subscription.remove();
    }, []),
  );

  const maxSelectable = topicsQuery.data?.maxSelectable ?? 0;
  const selectedCount = selectedTopicIds.length;
  const isLimitReached = maxSelectable > 0 && selectedCount >= maxSelectable;

  const topics = (topicsQuery.data?.items ?? []).map((topic) => {
    const isSelected = selectedTopicIds.includes(topic.topicId);
    return {
      ...topic,
      isSelected,
      // 상한 도달 시 미선택 칩만 비활성 처리한다 — 선택된 칩은 계속 눌러 해제할 수 있어야 한다
      isDimmed: !isSelected && isLimitReached,
    };
  });

  const toggleTopic = (topicId: string) => {
    if (selectedTopicIds.includes(topicId)) {
      setSelectedTopicIds(selectedTopicIds.filter((id) => id !== topicId));
      return;
    }
    // 4번째 탭은 무시하지 않고 토스트로 이유를 알린다 — 무반응은 버그로 읽힌다(onboarding-uiux.md 4.1)
    if (isLimitReached) {
      showToast(ONBOARDING_COPY.topic.limitToast);
      return;
    }
    setSelectedTopicIds([...selectedTopicIds, topicId]);
  };

  const canGoNext = selectedCount >= 1;

  const handleNextPress = () => {
    if (!canGoNext || saveInterestsMutation.isPending) return;
    saveInterestsMutation.mutate(
      { topicIds: selectedTopicIds },
      {
        onSuccess: () => navigation.navigate('Career'),
        onError: (error) => {
          if (isApiError(error)) {
            // 노출이 내려간 주제가 섞임 → 목록 재조회 후 선택 초기화(onboarding-api.md 5장)
            if (error.errorCode === ERROR_CODES.ONBOARDING_TOPIC_UNAVAILABLE) {
              showToast(error.message);
              setSelectedTopicIds([]);
              void topicsQuery.refetch();
              return;
            }
            showToast(error.message);
            return;
          }
          showToast(ONBOARDING_COPY.topic.loadFailedDescription);
        },
      },
    );
  };

  return {
    topics,
    selectedCount,
    maxSelectable,
    canGoNext,
    isSubmitting: saveInterestsMutation.isPending,
    /** O5 스켈레톤 — 0.3초 미만이면 표시하지 않는다 */
    showSkeleton: useDelayedVisible(topicsQuery.isPending),
    isLoading: topicsQuery.isPending,
    isError: topicsQuery.isError,
    isRefetching: topicsQuery.isRefetching,
    refetch: () => void topicsQuery.refetch(),
    toggleTopic,
    handleNextPress,
  };
};
