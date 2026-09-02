import { registerTokenProvider } from '@/shared/api/api-client';

import { registerEmailVerifiedListener, sessionService } from '@/features/auth';
import { registerCareerSavedListener } from '@/features/career';
import { registerInterestSavedListener } from '@/features/interest';
import {
  completeLibraryItem,
  deleteLibraryItem,
  libraryKeys,
  restoreLibraryItem,
} from '@/features/library';
import { registerPlayerLibraryBridge } from '@/features/player';
import { profileKeys } from '@/features/profile';
import { settingsKeys } from '@/features/settings';

import { queryClient } from '../query-client';

/**
 * 앱 초기화 — shared·feature 인터페이스에 도메인 구현을 주입한다(architecture.md 4.3).
 * player ↔ library처럼 의존 방향(library → player)의 역방향 동작이 필요한 곳은
 * 여기서만 배선한다 — feature끼리 서로의 내부를 import하면 순환이 된다.
 * TODO: AppLifecycleService(포그라운드 복귀 조율)는 해당 기능 구현 시 여기서 기동한다.
 */
export const bootstrapApp = (): void => {
  registerTokenProvider(sessionService);

  // 관심사 저장 성공 → 프로필·설정 요약 재조회(각 index.ts의 갱신 계약 — 저장 성공에만 호출).
  // interest가 두 feature의 키를 직접 import하면 의존 표(4.4)와 순환이라 여기서 배선한다.
  registerInterestSavedListener(() => {
    void queryClient.invalidateQueries({ queryKey: profileKeys.summary() });
    void queryClient.invalidateQueries({ queryKey: settingsKeys.summary() });
  });

  // 커리어 저장 성공 → 프로필 요약 재조회(profile.md 4.4 — 복귀 시 카드 요약 갱신).
  // 설정은 커리어 값을 표시하지 않아(진입 행 라벨뿐 — settings.md 4.1) invalidate하지 않는다.
  registerCareerSavedListener(() => {
    void queryClient.invalidateQueries({ queryKey: profileKeys.summary() });
  });

  // 이메일 인증 성공 → 프로필·설정 요약 재조회(auth-uiux.md 4.15 — 복귀 화면의
  // 값과 미인증 배지가 함께 갱신돼야 한다. 주소가 같고 인증 상태만 바뀌는 경우가 있어
  // 주소 비교로 갱신을 생략하면 배지가 남는다).
  registerEmailVerifiedListener(() => {
    void queryClient.invalidateQueries({ queryKey: profileKeys.summary() });
    void queryClient.invalidateQueries({ queryKey: settingsKeys.summary() });
  });

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
