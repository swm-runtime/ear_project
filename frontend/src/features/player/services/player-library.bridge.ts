import type { QueueEntry, QueueItem } from '../player.types';

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
  /**
   * 재생 목록 패널이 그릴 목록 = library-api.md 4.1의 첫 페이지. 필터·커서를 받지 않는다 — 패널은
   * "지금 재생 중인 것이 속한 목록"을 보여주는 자리지 라이브러리 화면의 복제가 아니다(2026-09-17)
   */
  fetchQueue(): Promise<QueueItem[]>;
  /**
   * 재생 목록 순서 저장(library-api.md 4.8) — 보이는 목록의 항목 id 를 위에서부터. 순서의 진실은
   * 서버다: `fetchQueue`가 그 순서대로 돌려준다(`sort=queue`)
   */
  saveQueueOrder(itemIds: string[]): Promise<void>;
  /**
   * 탐색 맥락 재생 목록의 줄 담기(KAN-241 — explore-api.md 4.3 `POST /contents/:id/save`). 돌려주는 값은 생긴
   * `library_items.id` — 스냅샷 줄의 `itemId` 를 채워 담기 버튼을 걷는다. 낙관 반영·토스트는 player 몫
   */
  saveContent(contentId: string, clientSeq: number): Promise<string>;
  /**
   * "다음에 들어볼 만한"(player.md 4.2-2) 후보 — 지금 듣는 편과 비슷한 편(BE KAN-240 `related`, 나오기 전엔 생략) → 비면
   * 탐색 `interest` 섹션(피드 캐시 재사용). `excludeIds`(지금 듣는 편 + 스냅샷)는 뺀 채 돌려준다. 실패는 빈 배열로 —
   * 추천은 없어도 되는 블록이라 패널에 오류를 그리지 않는다
   */
  fetchUpNext(contentId: string, excludeIds: string[]): Promise<QueueEntry[]>;
}

let bridge: PlayerLibraryBridge | null = null;

export const registerPlayerLibraryBridge = (impl: PlayerLibraryBridge): void => {
  bridge = impl;
};

export const getPlayerLibraryBridge = (): PlayerLibraryBridge | null => bridge;
