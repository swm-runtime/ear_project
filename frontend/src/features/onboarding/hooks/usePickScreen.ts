import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { useToastStore } from '@/shared/ui/toast.store';

import { ONBOARDING_COPY } from '../onboarding.copy';
import type { OnboardingStackParamList } from '../onboarding.types';
import { useRecommendationsQuery } from './useRecommendationsQuery';
import { useSavePicksMutation } from './useSavePicksMutation';
import { onboardingCompletionService } from '../services/onboarding-completion.service';

export const usePickScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList, 'Pick'>>();
  const showToast = useToastStore((s) => s.show);
  const recommendationsQuery = useRecommendationsQuery();
  const savePicksMutation = useSavePicksMutation();
  const [selectedContentIds, setSelectedContentIds] = useState<string[]>([]);
  const hasProceededRef = useRef(false);

  const sections = recommendationsQuery.data ?? [];
  const totalCount = sections.reduce((sum, section) => sum + section.items.length, 0);

  // 재개 진입(onboarding_step = pick)은 스택에 이 화면 하나만 쌓여 goBack이 무시된다 —
  // 이전 단계(Topic → Career)를 재구성해 명세의 복귀 경로를 복원한다(tickets: onboarding-resume-back-button-dead)
  const handleBackPress = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.reset({ index: 1, routes: [{ name: 'Topic' }, { name: 'Career' }] });
  }, [navigation]);

  // 하드웨어 뒤로가기도 같은 경로를 탄다 — 스택이 1개일 때 기본 동작(앱 이탈)을 막는다
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBackPress();
        return true;
      });
      return () => subscription.remove();
    }, [handleBackPress]),
  );

  /** 완료 요청을 발사하고 다음 화면으로 넘어간다 — 완료 이후 구간은 뒤로 올 수 없다(navigation.reset) */
  const proceed = (nextScreen: 'Complete' | 'FirstDripWaiting') => {
    if (hasProceededRef.current) return;
    hasProceededRef.current = true;
    onboardingCompletionService.request();
    navigation.reset({ index: 0, routes: [{ name: nextScreen }] });
  };

  // 추천 0건은 정상 상태가 아니다 — 3단계를 건너뛰고 0건 담기 경로로 보낸다(onboarding.md 7).
  // 에러 화면·"추천할 콘텐츠가 없어요" 화면을 만들지 않는다(onboarding-uiux.md 4.4)
  useEffect(() => {
    if (recommendationsQuery.isSuccess && totalCount === 0) {
      proceed('FirstDripWaiting');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- proceed는 ref 가드로 1회만 실행된다
  }, [recommendationsQuery.isSuccess, totalCount]);

  const toggleContent = (contentId: string) => {
    setSelectedContentIds((prev) =>
      prev.includes(contentId) ? prev.filter((id) => id !== contentId) : [...prev, contentId],
    );
  };

  const selectedCount = selectedContentIds.length;

  const handleProceedPress = async () => {
    if (savePicksMutation.isPending || hasProceededRef.current) return;

    // 0건 선택 — [건너뛰기] 즉시 완료 요청 + 완료 대기 화면(onboarding.md 4 [3])
    if (selectedCount === 0) {
      proceed('FirstDripWaiting');
      return;
    }

    try {
      const result = await savePicksMutation.mutateAsync({ contentIds: selectedContentIds });
      // 담기 부분 실패는 진행을 막지 않는다 — 성공한 건만 적립하고 토스트로 알린다(onboarding.md 7)
      if (result.failed.length > 0) {
        const hasWithdrawn = result.failed.some(
          (f) => f.errorCode === ERROR_CODES.CONTENT_WITHDRAWN,
        );
        showToast(
          hasWithdrawn
            ? ONBOARDING_COPY.pick.withdrawnToast
            : ONBOARDING_COPY.pick.partialFailToast(result.failed.length),
        );
      }
      // 서버가 센 적립 수가 0이면 0건 담기 경로다 — 대기 여부 판정은 어차피 서버가 한다(onboarding-api.md 4.7)
      proceed(result.pickedCount > 0 ? 'Complete' : 'FirstDripWaiting');
    } catch (error) {
      // 담기 요청 전체 실패 — 화면에 머물러 재시도할 수 있게 한다
      showToast(isApiError(error) ? error.message : ONBOARDING_COPY.topic.loadFailedDescription);
    }
  };

  return {
    sections,
    selectedContentIds,
    selectedCount,
    isSubmitting: savePicksMutation.isPending,
    /** O12 스켈레톤 — 섹션 제목도 스켈레톤으로 둔다(onboarding-uiux.md 4.4) */
    showSkeleton: useDelayedVisible(recommendationsQuery.isPending),
    isLoading: recommendationsQuery.isPending,
    isError: recommendationsQuery.isError,
    isRefetching: recommendationsQuery.isRefetching,
    refetch: () => void recommendationsQuery.refetch(),
    toggleContent,
    handleProceedPress,
    handleBackPress,
  };
};
