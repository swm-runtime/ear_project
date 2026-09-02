/**
 * player → library 동작의 의존 역전 지점. library는 player의 게이트를 쓰는 상위 소비자라
 * (architecture.md 4.4: library → player) player가 library를 직접 import하면 순환이 된다.
 * TokenProvider(architecture.md 4.3)와 같은 방식으로 인터페이스만 선언하고 구현은
 * app/bootstrap이 library 공개 API로 주입한다.
 */

export interface PlayerLibraryBridge {
  /** 더보기 [라이브러리에서 삭제](library-api.md 4.6) — 소프트 삭제. 플레이어·재생은 유지된다 */
  deleteItem(itemId: string): Promise<void>;
  /** 삭제 스낵바 [실행 취소] 이후의 서버 복구(library-api.md 4.7) — 스낵바 내 취소는 로컬뿐 */
  restoreItem(itemId: string): Promise<void>;
  /** duration_sec이 없는 콘텐츠의 완청 폴백 트리거(library-api.md 4.5) — 409는 조용히 무시 */
  completeItem(itemId: string): Promise<void>;
  /** 완청 전이·삭제 후 라이브러리 목록 재조회 — player는 library의 쿼리 키를 모른다 */
  invalidateLibrary(): void;
}

let bridge: PlayerLibraryBridge | null = null;

export const registerPlayerLibraryBridge = (impl: PlayerLibraryBridge): void => {
  bridge = impl;
};

export const getPlayerLibraryBridge = (): PlayerLibraryBridge | null => bridge;
