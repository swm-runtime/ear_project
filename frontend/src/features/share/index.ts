/**
 * share feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 공유(FR-27)는 전용 화면이 없는 횡단 동작이다 — 네 진입점(library·explore·player·
 * content-detail)이 이 API로 실행하고, 링크 수신 게이트는 app(RootNavigator)이 배치한다.
 */
export { IS_SHARE_ENABLED } from './share.constants';
export { SHARE_COPY } from './share.copy';
export { shareContent } from './share.service';
export type { ShareContentInput } from './share.service';
/** 더보기 시트 경유 공유 전용 — iOS의 Modal dismiss ↔ 시스템 시트 present 경합을 우회한다 */
export { useDeferredSheetShare } from './hooks/useDeferredSheetShare';
export { useShareLinkGate } from './hooks/useShareLinkGate';
export { default as ShareIcon } from './components/ShareIcon';
