import { registerTokenProvider } from '@/shared/api/api-client';

import { sessionService } from '@/features/auth';
import {
  completeLibraryItem,
  deleteLibraryItem,
  libraryKeys,
  restoreLibraryItem,
} from '@/features/library';
import { registerPlayerLibraryBridge } from '@/features/player';

import { queryClient } from '../query-client';

/**
 * 앱 초기화 — shared·feature 인터페이스에 도메인 구현을 주입한다(architecture.md 4.3).
 * player ↔ library처럼 의존 방향(library → player)의 역방향 동작이 필요한 곳은
 * 여기서만 배선한다 — feature끼리 서로의 내부를 import하면 순환이 된다.
 * TODO: AppLifecycleService(포그라운드 복귀 조율)는 해당 기능 구현 시 여기서 기동한다.
 */
export const bootstrapApp = (): void => {
  registerTokenProvider(sessionService);

  registerPlayerLibraryBridge({
    deleteItem: async (itemId) => {
      await deleteLibraryItem({ itemId });
    },
    restoreItem: async (itemId) => {
      await restoreLibraryItem({ itemId });
    },
    completeItem: async (itemId) => {
      await completeLibraryItem({ itemId });
    },
    invalidateLibrary: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
};
