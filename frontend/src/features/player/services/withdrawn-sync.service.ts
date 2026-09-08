import { AppState, type NativeEventSubscription } from 'react-native';

import { logger } from '@/shared/lib/logger';
import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import { playbackService } from './playback.service';
import { getPlayerLibraryBridge } from './player-library.bridge';
import { getWithdrawnContents } from '../api/player.api';

/**
 * 회수 동기화(`partner-control.md` 4.3 처리 순서 5 · `player-api.md` 4.6).
 *
 * 회수는 **재생 중이 아니었던 세션에도 닿아야 한다.** 서버는 회수 즉시 `library_items`를
 * 지우므로 다음 목록 조회는 이미 옳지만, 앱이 백그라운드에 있는 동안 회수된 콘텐츠는
 * 화면 캐시·미니플레이어에 그대로 남는다. 복귀 시점에 그것을 걷어내는 것이 이 서비스다.
 *
 * **재생 중 세션의 중단은 여기가 아니다** — 위치 저장(4.3) 응답의 `content_status`가
 * 주 채널이고 지연 상한이 저장 주기(5초)다. 이 서비스의 상한은 포그라운드 복귀 시점이다.
 */

/**
 * `since`에서 빼는 여유. 기기 시계가 서버보다 앞서 있으면 그 차이만큼의 회수분을 건너뛴다 —
 * 겹쳐 받아서 막는다. 중복 수신은 무해하다(이미 사라진 것을 다시 지울 뿐).
 */
const SYNC_SKEW_MARGIN_MS = 5 * 60 * 1000;

let appStateSubscription: NativeEventSubscription | null = null;
let inFlight: Promise<void> | null = null;
/**
 * 로그인 여부. player가 auth를 직접 import하면 의존 표(architecture.md 4.4)를 어기므로
 * `app/bootstrap`이 주입한다. 로그아웃 상태의 조회는 401을 낳고 토큰 갱신 실패로 이어진다.
 */
let isAuthenticated: () => boolean = () => false;

/**
 * 첫 실행에는 조회하지 않고 커서만 세운다. `since`가 없으면 전체 회수 이력을 받게 되는데,
 * 그 목록으로 지울 것이 애초에 없다 — 이 기기가 그 콘텐츠를 화면에 들고 있던 적이 없다.
 */
const readCursor = async (): Promise<string | null> =>
  secureStorage.get(STORAGE_KEYS.PLAYER_WITHDRAWN_SYNCED_AT);

const runSync = async (): Promise<void> => {
  const requestedAt = new Date();
  const cursor = await readCursor();
  if (cursor === null) {
    await secureStorage.set(STORAGE_KEYS.PLAYER_WITHDRAWN_SYNCED_AT, requestedAt.toISOString());
    return;
  }

  const since = new Date(Date.parse(cursor) - SYNC_SKEW_MARGIN_MS).toISOString();
  const contentIds = await getWithdrawnContents({ since });

  // 커서는 응답을 받은 뒤에만 전진시킨다 — 실패한 구간을 건너뛰면 그 회수분은 영영 오지 않는다
  await secureStorage.set(STORAGE_KEYS.PLAYER_WITHDRAWN_SYNCED_AT, requestedAt.toISOString());
  if (contentIds.length === 0) return;

  logger.debug('[player] withdrawn sync', contentIds.length);
  // 재생 중이던 콘텐츠가 목록에 있으면 멈춘다(4.3이 못 잡은 경우 — 일시정지 상태로 대기 중이던 세션)
  playbackService.handleWithdrawnContents(contentIds);
  // 라이브러리는 서버에서 이미 지워졌다 — 화면이 들고 있는 캐시만 무르면 된다
  getPlayerLibraryBridge()?.invalidateLibrary();
};

/**
 * 동기화 1회. 실패는 사용자에게 알리지 않는다 — 배경 동기화이고, 다음 복귀에 다시 시도한다
 * (`common-error-handling.md` 4.3). 커서를 전진시키지 않았으므로 놓친 구간도 다음에 함께 온다.
 */
export const syncWithdrawnContents = (): void => {
  if (inFlight || !isAuthenticated()) return;
  inFlight = runSync()
    .catch((error) => logger.debug('[player] withdrawn sync failed', error))
    .finally(() => {
      inFlight = null;
    });
};

/**
 * 앱 실행 시 1회 + 포그라운드 복귀마다 동기화한다(`partner-control.md` 4.3).
 * `app/bootstrap`이 기동한다 — 서비스는 React 트리 밖 싱글턴이라 화면 생명주기와 무관하다.
 */
export const startWithdrawnSync = (checkAuthenticated: () => boolean): void => {
  isAuthenticated = checkAuthenticated;
  if (appStateSubscription) return;
  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') syncWithdrawnContents();
  });
  /*
   * 여기서 한 번 부르지만 **콜드 스타트에서는 대개 그냥 지나간다** — 기동 시점의 세션은
   * 아직 `restoring`이라 로그인 판정이 false다. 그리고 콜드 스타트에는 AppState 전이가
   * 없다(이미 `active`로 뜬다). 그래서 로그인 완료를 신호로 한 번 더 불러야 한다 —
   * 그 배선은 `app/bootstrap`이 한다(2026-09-08 — 이게 빠져서 앱을 껐다 켜기만 하면
   * 동기화가 영영 돌지 않았다).
   */
  syncWithdrawnContents();
};
