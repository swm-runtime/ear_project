import { NavigationContainer, type NavigationState } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { trackScreen } from '@/shared/analytics';
import { AppErrorBoundary, initSentry, wrapWithSentry } from '@/shared/monitoring';
import Toast from '@/shared/ui/Toast';

import { UpdateRecommendDialog } from '@/features/app-update';

import { bootstrapApp } from './bootstrap';
import { focusedRouteName } from './navigation/focused-route';
import RootNavigator from './navigation/RootNavigator';
import { queryClient } from './query-client';

// 부트스트랩보다 먼저 — 부트스트랩 안에서 나는 오류도 잡아야 한다
initSentry();
bootstrapApp();

let lastTrackedScreen: string | null = null;

/** GA4 `screen_view` — 포커스된 리프 라우트가 바뀔 때만(같은 화면 재렌더에 중복 발송 금지, analytics.md 4장) */
const handleNavigationStateChange = (state: NavigationState | undefined): void => {
  const name = focusedRouteName(state);
  if (name === null || name === lastTrackedScreen) return;
  lastTrackedScreen = name;
  trackScreen(name);
};

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <NavigationContainer onStateChange={handleNavigationStateChange}>
            <RootNavigator />
          </NavigationContainer>
          {/* 권장 업데이트 안내(splash.md 4.1 · KAN-99) — Modal 이라 어느 스택 위에서든 뜨고, 관문 통과 뒤에만 켜진다 */}
          <UpdateRecommendDialog />
          <Toast />
          <StatusBar style="auto" />
        </SafeAreaProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

// 네이티브 크래시·터치 breadcrumb 수집 — DSN 이 없으면 wrap 은 그대로 통과시킨다
export default wrapWithSentry(App);
