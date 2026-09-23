import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary, initSentry, wrapWithSentry } from '@/shared/monitoring';
import Toast from '@/shared/ui/Toast';

import { bootstrapApp } from './bootstrap';
import RootNavigator from './navigation/RootNavigator';
import { queryClient } from './query-client';

// 부트스트랩보다 먼저 — 부트스트랩 안에서 나는 오류도 잡아야 한다
initSentry();
bootstrapApp();

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
          <Toast />
          <StatusBar style="auto" />
        </SafeAreaProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

// 네이티브 크래시·터치 breadcrumb 수집 — DSN 이 없으면 wrap 은 그대로 통과시킨다
export default wrapWithSentry(App);
