/**
 * interest feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 다른 feature·app은 이 파일을 통해서만 interest에 접근한다.
 *
 * 주제 목록(계약·캐시·칩 컴포넌트)은 이 feature가 소유하고 온보딩 1단계가 가져다 쓴다
 * (architecture.md 4.4 — onboarding → interest). 같은 엔드포인트의 계약을 두 feature가
 * 각자 선언하면 한쪽만 고쳐지는 순간 두 화면의 선택지가 어긋난다.
 */
export { default as InterestManagementScreen } from './screens/InterestManagementScreen';
export { default as TopicChip, topicImageSource } from './components/TopicChip';
export { interestKeys } from './api/interest.api';
export { useTopicsQuery } from './hooks/useTopicsQuery';
export type { TopicItem, TopicList } from './interest.types';
/**
 * 저장 성공 통지 구독 — 프로필·설정 요약 invalidate는 app/bootstrap이 이걸로 주입한다
 * (interest가 두 feature의 키를 직접 import하면 의존 표 4.4의 방향과 순환이 된다)
 */
export { registerInterestSavedListener } from './services/interest-saved-listener';
/**
 * dev mock 전용 — 관심사 상태의 mock 원본은 이 feature 하나다(실서버의 user_interests처럼).
 * INTEREST_MOCK_TOPICS는 온보딩 mock의 추천 생성이, getInterestMockSummary는 프로필·설정
 * mock의 interest_summary가, seedInterestMockFromOnboarding은 온보딩 1단계 저장이 쓴다.
 */
export {
  INTEREST_MOCK_TOPICS,
  getInterestMockSummary,
  seedInterestMockFromOnboarding,
} from './api/interest.mock';
