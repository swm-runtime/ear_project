import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { theme } from '@/shared/theme';
import FullScreenError from '@/shared/ui/FullScreenError';

import {
  CareerScreen,
  CompleteScreen,
  exitOnboarding,
  FirstDripWaitingScreen,
  ONBOARDING_COPY,
  TopicSelectScreen,
  TopicSelectSkeleton,
  useOnboardingStateQuery,
  useOnboardingStore,
  type OnboardingStackParamList,
  type OnboardingStep,
} from '@/features/onboarding';

const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();

/**
 * 재개 지점(onboarding_step) → 시작 화면. 서버의 `pick`(2단계 저장 뒤)·`done`(완료 직전)은 담기 화면을 뺀 뒤
 * (2026-10-11) 곧바로 완료 대기로 보낸다 — 그 화면이 완료 요청을 쏘고 첫 드립을 기다린다
 */
const RESUME_ROUTES: Record<OnboardingStep, keyof OnboardingStackParamList> = {
  topic: 'Topic',
  career: 'Career',
  pick: 'FirstDripWaiting',
  done: 'FirstDripWaiting',
};

/**
 * 주제(1/2) → 커리어(2/2) → 완료 대기(완료 요청 + 첫 드립) → 완료(자동 통과) → 탐색. 추천 콘텐츠 담기(구 3/3)는
 * 뺐다(PM 2026-10-11) — 첫 드립이 라이브러리를 채운다.
 * 진입 시 서버의 onboarding_step부터 재개한다(onboarding.md 2, splash.md 4).
 * 온보딩은 서버 저장이 필수라 상태 조회 실패 시 진행 경로를 열지 않는다(onboarding-api.md 2).
 */
export default function OnboardingNavigator() {
  const stateQuery = useOnboardingStateQuery();
  const setSelectedTopicIds = useOnboardingStore((s) => s.setSelectedTopicIds);
  const showSkeleton = useDelayedVisible(stateQuery.isPending);

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

  // 재개 지점을 받기 전 — 첫 단계(주제 선택) 모양의 스켈레톤. 0.3초 안에 오면 빈 바탕만 잠깐 보인다
  if (!state || state.onboardingCompleted) {
    return showSkeleton ? <TopicSelectSkeleton /> : <View style={styles.loading} />;
  }

  return (
    <OnboardingStack.Navigator
      initialRouteName={RESUME_ROUTES[state.onboardingStep]}
      screenOptions={{ headerShown: false }}
    >
      <OnboardingStack.Screen name="Topic" component={TopicSelectScreen} />
      <OnboardingStack.Screen name="Career" component={CareerScreen} />
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
  },
});
