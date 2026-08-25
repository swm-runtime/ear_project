/**
 * 공유(FR-27)는 P1이다 — MVP 빌드에서는 네 진입점(라이브러리·탐색·플레이어 더보기 시트,
 * 콘텐츠 상세 앱바) 어디에도 노출하지 않는다(share.md 2, README 결정 42 — 이 조건이 다른
 * 모든 규칙에 우선한다). **비활성 노출도 금지**라 행·아이콘 자체를 이 플래그로 거른다
 * (share-uiux.md 8장). 수신 게이트(useShareLinkGate)도 같은 플래그를 따른다.
 *
 * P1 활성화 시 기본값을 켠다. 개발 검증: EXPO_PUBLIC_SHARE_ENABLED=true
 */
export const IS_SHARE_ENABLED = process.env.EXPO_PUBLIC_SHARE_ENABLED === 'true';
