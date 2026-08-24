/**
 * explore feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 다른 feature·app은 이 파일을 통해서만 explore에 접근한다.
 */
export { default as ExploreScreen } from './screens/ExploreScreen';
export { EXPLORE_COPY } from './explore.copy';
export type { ExploreItem, ExploreTopic } from './explore.types';

/**
 * 담기 계약(explore-api.md 4.3)의 소유자는 explore다 — 콘텐츠 상세 화면이 같은 계약을
 * 재사용한다(content-detail-api.md 4.2 — 재선언하면 같은 엔드포인트의 DTO가 두 벌이 된다).
 */
export { saveContent } from './api/explore.api';
export type { SaveContentResult, SaveReason } from './explore.types';
