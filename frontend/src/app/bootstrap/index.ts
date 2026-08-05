import { registerTokenProvider } from '@/shared/api/api-client';

import { sessionService } from '@/features/auth';

/**
 * 앱 초기화 — shared 인터페이스에 도메인 구현을 주입한다(architecture.md 4.3).
 * TODO: AppLifecycleService(포그라운드 복귀 조율)는 해당 기능 구현 시 여기서 기동한다.
 */
export const bootstrapApp = (): void => {
  registerTokenProvider(sessionService);
};
