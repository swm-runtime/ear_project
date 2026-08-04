import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Toast from '@/shared/ui/Toast';

import { bootstrapApp } from './bootstrap';
import RootNavigator from './navigation/RootNavigator';

bootstrapApp();

// 서버 에러 재시도는 ApiClient 인터셉터가 전담한다(architecture.md 8.1) — Query 층에서 중복 재시도하지 않는다
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
        <Toast />
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
