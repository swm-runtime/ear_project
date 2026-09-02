import { QueryClient } from '@tanstack/react-query';

/**
 * 앱 전역 QueryClient — App(Provider)과 bootstrap(feature 간 배선)이 같은 인스턴스를 쓴다.
 * 서버 에러 재시도는 ApiClient 인터셉터가 전담한다(architecture.md 8.1) — Query 층에서
 * 중복 재시도하지 않는다.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});
