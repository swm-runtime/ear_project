import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { BackHandler } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { useToastStore } from '@/shared/ui/toast.store';

import type { OnboardingStackParamList, YearsOfExperience } from '../onboarding.types';
import { useSaveCareerMutation } from './useSaveCareerMutation';

type PendingAction = 'next' | 'skip' | null;

export const useCareerScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList, 'Career'>>();
  const showToast = useToastStore((s) => s.show);
  const saveCareerMutation = useSaveCareerMutation();

  const [jobCategory, setJobCategory] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState<YearsOfExperience | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  // 재개 진입(onboarding_step = career)은 스택에 이 화면 하나만 쌓여 goBack이 무시된다 —
  // 명세의 O1 복귀·선택 복원 경로를 스택 재구성으로 복원한다(tickets: onboarding-resume-back-button-dead)
  const handleBackPress = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.reset({ index: 0, routes: [{ name: 'Topic' }] });
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

  const submit = (action: Exclude<PendingAction, null>) => {
    if (saveCareerMutation.isPending) return;
    setPendingAction(action);

    // [건너뛰기]도 서버 요청을 보낸다 — 단계 이동은 서버가 아는 재개 지점이다(onboarding-uiux.md 4.3)
    const input =
      action === 'skip'
        ? {}
        : {
            ...(jobCategory !== null && { jobCategory }),
            ...(jobTitle.trim() !== '' && { jobTitle: jobTitle.trim() }),
            ...(yearsOfExperience !== null && { yearsOfExperience }),
          };

    saveCareerMutation.mutate(input, {
      onSuccess: () => navigation.navigate('Pick'),
      onError: (error) => {
        showToast(isApiError(error) ? error.message : '저장하지 못했어요. 다시 시도해주세요');
      },
      onSettled: () => setPendingAction(null),
    });
  };

  return {
    jobCategory,
    jobTitle,
    yearsOfExperience,
    setJobCategory,
    setJobTitle,
    setYearsOfExperience,
    isNextSubmitting: pendingAction === 'next',
    isSkipSubmitting: pendingAction === 'skip',
    isSubmitting: saveCareerMutation.isPending,
    // 미입력이어도 [다음]은 항상 활성 — 결과는 [건너뛰기]와 같다(onboarding-uiux.md 4.3)
    handleNextPress: () => submit('next'),
    handleSkipPress: () => submit('skip'),
    handleBackPress,
  };
};
