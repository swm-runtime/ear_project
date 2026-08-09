/**
 * 알림 feature의 서버 통신 대역 전환. 기기 동기화(PUT /users/me/devices/:device_id)가
 * onboarding에서 이곳으로 이관됐다(architecture.md 4.4 — settings·onboarding이 함께 쓴다).
 * 백엔드 실서버로 붙일 때는 EXPO_PUBLIC_NOTIFICATION_API=real 로 전환한다
 * (기존에 onboarding 플래그가 겸하던 구간이므로 onboarding 실서버 테스트 시 함께 켠다).
 */
export const IS_NOTIFICATION_API_MOCKED =
  __DEV__ && process.env.EXPO_PUBLIC_NOTIFICATION_API !== 'real';

/**
 * OS 권한 스텁의 초기 상태 시나리오(EXPO_PUBLIC_NOTIFICATION_MOCK_SCENARIO):
 * - (기본)                미결정 — 설정의 유도 배너 노출·온보딩 사전 안내 경로
 * - permission-granted    허용됨 — 배너 숨김·토글 즉시 저장, 온보딩 O10·O11 건너뛰기
 * - permission-denied     거부됨 — 토글 ON 시도 시 기기 설정 안내(S4)
 */
export const NOTIFICATION_MOCK_SCENARIO =
  process.env.EXPO_PUBLIC_NOTIFICATION_MOCK_SCENARIO ?? 'default';
