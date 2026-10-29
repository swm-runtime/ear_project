/**
 * content-review feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 콘텐츠 후기(L17 · L18 · L19)와 후기 참여 프로모션 · S12 프로모션 화면을 소유한다(content-review.md · content-review-api.md — KAN-280).
 *
 * 의존: auth(계정 id · 시장) · subscription(구독 조회 본문 변환 · 결제와 같은 배선 · 코드 입력 칸 · 지급 줄 문구).
 * **진입점 feature(library · explore · player · content-detail)를 import 하지 않는다** — 그쪽이 이 공개 API 를 쓴다(순환 없음).
 * 설정은 S12 를 라우트 이름(`Promotions`)으로만 연다. 화면 등록은 app/navigation 이 한다.
 */

/* ── 상시 진입점(더보기 시트 [후기] · 콘텐츠 상세 "내 후기") ── */
export { useContentReviewLauncher } from './hooks/useContentReviewLauncher';
export type { ContentReviewLauncher } from './hooks/useContentReviewLauncher';
export { default as ContentReviewSheets } from './components/ContentReviewSheets';
export { default as MyContentReviewRow } from './components/MyContentReviewRow';
export { CONTENT_REVIEW_COPY } from './content-review.copy';
export type { ContentReviewTarget } from './content-review.types';

/* ── 먼저 묻는 시트(L18) — 판정 조회는 라이브러리 진입(library), 그리기는 MainNavigator(app) ── */
export { useContentReviewEntry } from './hooks/useContentReviewEntry';
export { default as ContentReviewPrompt } from './components/ContentReviewPrompt';
export {
  selectIsContentReviewPromptVisible,
  useContentReviewStore,
} from './store/content-review.store';

/* ── S12 프로모션 · 설정 배지 ── */
export { default as PromotionsScreen } from './screens/PromotionsScreen';
export { useHasUnusedPromotion } from './hooks/usePromotionsQuery';

/* ── app/bootstrap 배선 — 로그인 전이 · 포그라운드 ── */
export {
  resetContentReviewSession,
  startContentReviewOutboxSync,
} from './services/content-review.service';
export { contentReviewKeys } from './api/content-review.api';
