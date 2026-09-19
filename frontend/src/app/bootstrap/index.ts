import { registerTokenProvider } from '@/shared/api/api-client';

import { registerEmailVerifiedListener, sessionService, useSessionStore } from '@/features/auth';
import { registerCareerSavedListener } from '@/features/career';
import { registerInterestSavedListener } from '@/features/interest';
import {
  completeLibraryItem,
  deleteLibraryItem,
  fetchLibraryItems,
  libraryKeys,
  restoreLibraryItem,
  saveQueueOrder,
} from '@/features/library';
import {
  clearPushState,
  resetDeviceSync,
  startDeviceSync,
  startPushReceiving,
  syncDeviceNow,
} from '@/features/notification';
import {
  registerPlayerLibraryBridge,
  startWithdrawnSync,
  stopPlaybackForSignOut,
  syncWithdrawnContents,
} from '@/features/player';
import { profileKeys } from '@/features/profile';
import { settingsKeys } from '@/features/settings';

import { forgetTab } from '../navigation/last-tab';
import { queryClient } from '../query-client';

/** 재생 목록 패널이 한 번에 받는 개수 — `GET /users/me/library-items`의 서버 상한(library-api.md 4.1) */
const QUEUE_PAGE_LIMIT = 50;

/**
 * 앱 초기화 — shared·feature 인터페이스에 도메인 구현을 주입한다(architecture.md 4.3).
 * player ↔ library처럼 의존 방향(library → player)의 역방향 동작이 필요한 곳은
 * 여기서만 배선한다 — feature끼리 서로의 내부를 import하면 순환이 된다.
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
    /*
     * 재생 목록 패널의 목록. 필터를 걸지 않은 첫 페이지를 그대로 준다 — 패널은 라이브러리 화면의 복제가
     * 아니라 "지금 듣는 것의 이웃"을 보여주는 자리다. 변환을 여기서 하는 이유는 player가 LibraryItem
     * 타입을 알면 의존 방향이 뒤집히기 때문이다(4.4)
     */
    fetchQueue: async () => {
      const page = await fetchLibraryItems({
        filter: 'all',
        topicIds: [],
        sourceFilter: null,
        // 사용자가 정한 순서를 서버가 입혀 준다(library-api.md 4.1 — KAN-70·74)
        sort: 'queue',
        /*
         * 서버 상한(50)까지 받는다. 순서를 저장하면 **보낸 목록에만** 자리가 매겨지고 나머지는
         * "순서 없음"으로 남아 맨 위로 온다(NULLS FIRST) — 첫 페이지가 작을수록 한 번도 본 적 없는
         * 옛 항목이 위로 튀어 오른다. 근본 수정은 BE 티켓 `queue-order-unseen-items.md`
         */
        limit: QUEUE_PAGE_LIMIT,
      });
      return page.items.map((item) => ({
        itemId: item.id,
        contentId: item.content.id,
        title: item.content.title,
        authorName: item.content.authorName || null,
        sourceName: item.content.sourceName || null,
        thumbnailUrl: item.content.thumbnailUrl || null,
        durationSec: item.content.durationSec ?? null,
        isCountedToday: item.isCountedToday,
        isCompleted: item.status === 'completed',
        topicIds: item.content.topicIds,
      }));
    },
    saveQueueOrder: (itemIds) => saveQueueOrder({ itemIds }),
  });

  /*
   * 회수 동기화(partner-control.md 4.3) — 앱 실행·포그라운드 복귀마다 회수 목록을 반영한다.
   * 로그인 여부 판정을 주입한다: player가 auth를 직접 import하면 의존 표(4.4)를 어기고,
   * 로그아웃 상태로 조회하면 401이 토큰 갱신 실패로 번진다.
   */
  const isSignedIn = (): boolean => useSessionStore.getState().status === 'authenticated';
  startWithdrawnSync(isSignedIn);

  /*
   * 기기 동기화(notification.md 4.2 · architecture.md 5.5) — 포그라운드 복귀·토큰 변경마다
   * OS 권한과 푸시 토큰을 서버에 맞춘다. 로그인 여부를 주입하는 이유는 회수 동기화와 같다.
   */
  startDeviceSync(isSignedIn);

  /*
   * 푸시 수신·탭(notification.md 4.4·4.5). 포그라운드 도착이면 라이브러리 목록을 조용히
   * 갱신한다 — notification이 library의 쿼리 키를 알지 않도록 여기서 배선한다.
   */
  startPushReceiving({
    onForegroundArrival: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });

  /*
   * **로그인 완료를 동기화 신호로 삼는다.** 기동 시점의 세션은 아직 `restoring`이라
   * 위 호출은 그냥 지나가고, 콜드 스타트에는 AppState 전이도 없다(이미 `active`로 뜬다).
   * 이 구독이 없으면 앱을 껐다 켜기만 하는 사용자에게는 회수 동기화가 영영 돌지 않는다.
   */
  useSessionStore.subscribe((state, previous) => {
    if (state.status === 'authenticated' && previous.status !== 'authenticated') {
      syncWithdrawnContents();
      // 서버는 로그아웃 때 이 기기의 토큰을 지운다 — 다시 로그인했으면 다시 올려야 알림이 온다
      syncDeviceNow();
    }
    /*
     * 로그아웃·탈퇴·세션 만료 → **재생을 끊는다**(auth.md 4.2-3). 지금까지 세션만
     * 정리되고 오디오는 계속 흘렀다 — 로그아웃이 안 된 것으로 읽히고, 다음 로그인 시
     * 앞 사용자의 콘텐츠가 미니플레이어에 남는다. 세 경로(설정 로그아웃·탈퇴·401 만료)가
     * 전부 이 전이를 지나므로 여기 한 곳에서 잡는다.
     */
    if (previous.status === 'authenticated' && state.status !== 'authenticated') {
      stopPlaybackForSignOut();
      // 앞 사용자가 탭한 알림의 목적지·배너를 다음 사용자에게 넘기지 않는다
      clearPushState();
      resetDeviceSync();
      // 다음 사용자가 앞 사용자의 탭에서 시작하면 안 된다(splash.md 4장 4-1)
      forgetTab();
    }
  });
};
