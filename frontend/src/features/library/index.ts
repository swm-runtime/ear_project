/**
 * library feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 다른 feature·app은 이 파일을 통해서만 library에 접근한다.
 */
export { default as LibraryScreen } from './screens/LibraryScreen';
export { LIBRARY_COPY } from './library.copy';
/** libraryKeys — 탐색의 담기·재생이 라이브러리 목록을 재조회시킬 때 쓴다(architecture.md 4.4) */
export { libraryKeys } from './api/library.api';
export type { LibraryFilter, LibraryItem, LibraryItemStatus, LibrarySource } from './library.types';

/* ── mock 브리지(dev 전용) — 탐색 mock이 라이브러리 mock 상태와 정합을 맞출 때 쓴다 ── */
export {
  getMockLibraryItemByContentId,
  mockSaveLibraryItemByContent,
  mockUnsaveLibraryItemByContent,
} from './api/library.mock';
export type { MockLibrarySaveMeta, MockLibrarySaveResult } from './api/library.mock';
