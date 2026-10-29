/**
 * library feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 다른 feature·app은 이 파일을 통해서만 library에 접근한다.
 */
export { default as LibraryScreen } from './screens/LibraryScreen';
export { LIBRARY_COPY } from './library.copy';
export { useLibraryArrivalBadge } from './hooks/useLibraryArrivalBadge';
/** 로그아웃 때 앞 계정의 도착 수·관측 기준을 다음 계정으로 넘기지 않는다. */
export { useLibraryArrivalStore } from './store/library-arrival.store';
/** libraryKeys — 탐색의 담기·재생이 라이브러리 목록을 재조회시킬 때 쓴다(architecture.md 4.4) */
export { libraryKeys } from './api/library.api';
/**
 * 삭제·복구·완청 트리거 — app/bootstrap이 player의 라이브러리 브리지 구현으로 주입한다
 * (player → library 직접 의존은 순환이라 금지 — architecture.md 4.3·4.4).
 */
export { completeLibraryItem, deleteLibraryItem, restoreLibraryItem } from './api/library.api';
/** 재생 목록 패널 — player가 브리지로 주입받는 목록의 원천(architecture.md 4.3 의존 역전) */
export { fetchLibraryItems, saveQueueOrder } from './api/library.api';
/**
 * 추천 별점 팝업(KAN-224) — 조회는 라이브러리 진입 때 이 feature 가 하고, 그리기는 다른 앱 시작 팝업과 순서를 맞추려고
 * MainNavigator 가 한다(가입 체험 안내와 같은 자리). 떠 있는지(`selectIsDripFeedbackVisible`)로 가입 체험 안내가 뒤로 선다.
 * 미전송 보관함 재전송·세션 초기화는 app/bootstrap 이 포그라운드 복귀·로그아웃에 건다
 */
export { default as DripFeedbackPrompt } from './components/DripFeedbackPrompt';
export {
  selectIsDripFeedbackSettled,
  selectIsDripFeedbackVisible,
  selectWasDripFeedbackShown,
  useDripFeedbackStore,
} from './store/drip-feedback.store';
export {
  resetDripFeedbackSession,
  startDripFeedbackOutboxSync,
} from './services/drip-feedback.service';
/** 스플래시 동안 첫 화면을 미리 받는다 — app/bootstrap이 로그인 완료 시점에 부른다 */
export { prefetchLibraryFirstPage } from './hooks/useLibraryItemsQuery';
export type { LibraryFilter, LibraryItem, LibraryItemStatus, LibrarySource } from './library.types';

/* ── mock 브리지(dev 전용) — 탐색 mock이 라이브러리 mock 상태와 정합을 맞출 때 쓴다 ── */
export {
  getMockLibraryItemByContentId,
  mockSaveLibraryItemByContent,
  mockUnsaveLibraryItemByContent,
} from './api/library.mock';
export type { MockLibrarySaveMeta, MockLibrarySaveResult } from './api/library.mock';
export { default as LibraryItemTile } from './components/LibraryItemTile';
export { default as LibrarySearchBarRow } from './components/LibrarySearchBarRow';
export { default as LibraryToolbar } from './components/LibraryToolbar';
