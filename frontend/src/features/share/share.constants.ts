/**
 * 공유(FR-27) — **P1 활성화됨(2026-09-06, 두 번째 TestFlight 빌드부터).** 네 진입점
 * (라이브러리·탐색·플레이어 더보기 시트, 콘텐츠 상세 앱바)과 수신 게이트(useShareLinkGate)가
 * 이 플래그를 따른다(share-uiux.md 8장 — 꺼지면 비활성 노출 없이 행·아이콘 자체가 사라진다).
 *
 * 기본값을 켜는 것이 원 설계다 — env 누락으로 조용히 꺼진 빌드가 나가는 사고를 막는다
 * (`tickets/frontend/pending/share-p1-activation-next-build.md` 요청 3). 끌 때만
 * EXPO_PUBLIC_SHARE_ENABLED=false 를 명시한다.
 */
export const IS_SHARE_ENABLED = process.env.EXPO_PUBLIC_SHARE_ENABLED !== 'false';
