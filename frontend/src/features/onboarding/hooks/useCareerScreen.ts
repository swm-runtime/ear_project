import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';

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
    handleBackPress: () => navigation.goBack(),
  };
};
