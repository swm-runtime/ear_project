import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { useToastStore } from '@/shared/ui/toast.store';

import { isTopicListUnavailable, useTopicsQuery } from '@/features/interest';

import { ONBOARDING_COPY } from '../onboarding.copy';
import type { OnboardingStackParamList } from '../onboarding.types';
import { useSaveInterestsMutation } from './useSaveInterestsMutation';
import { useOnboardingStore } from '../store/onboarding.store';

export const useTopicSelectScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList, 'Topic'>>();
  const showToast = useToastStore((s) => s.show);
  // 주제 목록은 관심사 관리와 같은 계약·같은 캐시다(interest-management-api.md 4.1)
  const topicsQuery = useTopicsQuery();
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

  /**
   * O6을 그려야 하는가 — 조회 실패와 "200인데 주제가 0건"을 함께 참으로 본다(onboarding.md 7).
   * 빈 목록은 정상 응답이라 isError가 false다: 이 판정이 없으면 재시도 수단이 없는 빈 화면이 된다.
   */
  const isUnavailable = isTopicListUnavailable({
    isPending: topicsQuery.isPending,
    isError: topicsQuery.isError,
    topicCount: topics.length,
  });
  /** 두 사유의 카피가 다르다 — 실패는 "불러오지 못했어요", 0건은 "아직 준비 중이에요" */
  const isEmpty = isUnavailable && !topicsQuery.isError;

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
    /** O6을 그릴 조건 — 조회 실패 + 노출 주제 0건 */
    isUnavailable,
    /** 그중 0건 사유인가 — 화면이 카피를 고르는 데 쓴다 */
    isEmpty,
    isRefetching: topicsQuery.isRefetching,
    refetch: () => void topicsQuery.refetch(),
    toggleTopic,
    handleNextPress,
  };
};
