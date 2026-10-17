import type { Market } from '@/features/auth';

/**
 * [커리어 정보] 진입 행을 보여 주는 시장인가 — 프로필 요약 그룹과 설정 콘텐츠 섹션이 함께 쓴다.
 *
 * **GLOBAL 시장 계정에는 두지 않는다**(PM 확정 2026-10-18). KR 은 종전 그대로 노출한다.
 * 시장은 서버가 가입 때 정한 세션 `user.market` 을 받는다 — 기기 언어로 추측하지 않는다(global-api.md 2.1).
 * 판정 하나를 두 화면이 각자 적으면 한쪽만 고쳐지는 순간 두 화면이 어긋나 이 feature 한 곳에 둔다.
 */
export const isCareerEntryVisible = (market: Market): boolean => market !== 'global';
