import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { theme } from '@/shared/theme';
import FullScreenError from '@/shared/ui/FullScreenError';

import {
  CareerScreen,
  CompleteScreen,
  exitOnboarding,
  FirstDripWaitingScreen,
  ONBOARDING_COPY,
  PickScreen,
  TopicSelectScreen,
  useOnboardingStateQuery,
  useOnboardingStore,
  type OnboardingStackParamList,
  type OnboardingStep,
} from '@/features/onboarding';

const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();

/** 재개 지점(onboarding_step) → 시작 화면. done은 완료 직전 상태이므로 3단계로 보낸다 */
const RESUME_ROUTES: Record<OnboardingStep, keyof OnboardingStackParamList> = {
  topic: 'Topic',
  career: 'Career',
  pick: 'Pick',
  done: 'Pick',
};

/**
 * 주제(1/3) → 커리어(2/3) → 담기(3/3) → [완료 대기] → 완료 → 알림 → 라이브러리.
 * 진입 시 서버의 onboarding_step부터 재개한다(onboarding.md 2, splash.md 4).
 * 온보딩은 서버 저장이 필수라 상태 조회 실패 시 진행 경로를 열지 않는다(onboarding-api.md 2).
 */
export default function OnboardingNavigator() {
  const stateQuery = useOnboardingStateQuery();
  const setSelectedTopicIds = useOnboardingStore((s) => s.setSelectedTopicIds);
  const showSpinner = useDelayedVisible(stateQuery.isPending);

  const state = stateQuery.data;

  // 서버에 저장된 선택·완료 상태와 로컬 상태를 동기화한다
  useEffect(() => {
    if (!state) return;
    // 다른 기기에서 이미 완료한 계정 — 온보딩을 다시 시키지 않고 곧바로 라이브러리로(onboarding-api.md 4.1)
    if (state.onboardingCompleted) {
      exitOnboarding();
      return;
    }
    // 저장분이 상한을 넘으면 앞의 3개만 복원한다(onboarding.md 7)
    setSelectedTopicIds(state.selectedTopicIds.slice(0, 3));
  }, [state, setSelectedTopicIds]);

  if (stateQuery.isError) {
    return (
      <FullScreenError
        title={ONBOARDING_COPY.topic.loadFailedTitle}
        description={ONBOARDING_COPY.topic.loadFailedDescription}
        retryLabel={ONBOARDING_COPY.topic.retry}
        isRetrying={stateQuery.isRefetching}
        onRetry={() => void stateQuery.refetch()}
      />
    );
  }

  if (!state || state.onboardingCompleted) {
    return (
      <View style={styles.loading}>
        {showSpinner ? <ActivityIndicator size="large" color={theme.color.primary} /> : null}
      </View>
    );
  }

  return (
    <OnboardingStack.Navigator
      initialRouteName={RESUME_ROUTES[state.onboardingStep]}
      screenOptions={{ headerShown: false }}
    >
      <OnboardingStack.Screen name="Topic" component={TopicSelectScreen} />
      <OnboardingStack.Screen name="Career" component={CareerScreen} />
      <OnboardingStack.Screen name="Pick" component={PickScreen} />
      {/* 완료 요청 이후 구간 — 스와이프 백으로도 되돌아갈 수 없다(onboarding-uiux.md 4.5·4.6) */}
      <OnboardingStack.Screen
        name="FirstDripWaiting"
        component={FirstDripWaitingScreen}
        options={{ gestureEnabled: false }}
      />
      <OnboardingStack.Screen
        name="Complete"
        component={CompleteScreen}
        options={{ gestureEnabled: false }}
      />
    </OnboardingStack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: theme.color.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
