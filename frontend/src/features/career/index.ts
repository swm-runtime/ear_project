/**
 * career feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 다른 feature·app은 이 파일을 통해서만 career에 접근한다.
 *
 * 직군 목록(계약·캐시)은 이 feature가 소유하고 온보딩 2단계가 가져다 쓴다(career-api.md 4.3 —
 * 온보딩과 공용, 클라이언트 상수 금지. 온보딩 쪽 교체는 티켓
 * onboarding-job-categories-server-list가 소유한다). 같은 엔드포인트의 계약을 두 feature가
 * 각자 선언하면 한쪽만 고쳐지는 순간 두 화면의 선택지가 어긋난다.
 */
export { default as CareerInfoScreen } from './screens/CareerInfoScreen';
export { careerKeys } from './api/career.api';
export { useJobCategoriesQuery } from './hooks/useJobCategoriesQuery';
export { jobCategoryImageSource } from './career.images';
/**
 * 커리어 폼 부품 — 커리어 정보 화면과 온보딩 2/2(O4)가 같은 부품을 쓴다(PM 2026-10-11 "온보딩 2/2 는 설정의 커리어 정보에서
 * 입력하는 거 가져오자"). 모양·동작의 원본은 이 feature 하나다.
 */
export { default as JobCategoryChips, JOB_CHIP_HEIGHT, JOB_CHIP_RADIUS } from './components/JobCategoryChips';
export { default as JobTitleField } from './components/JobTitleField';
export { default as YearsSegment } from './components/YearsSegment';
export type { CareerInfo, JobCategory, YearsOfExperienceRange } from './career.types';
/**
 * 저장 성공 통지 구독 — 프로필 요약 invalidate는 app/bootstrap이 이걸로 주입한다
 * (career가 profile의 키를 직접 import하면 의존 방향이 역행한다 — interest와 같은 방식)
 */
export { registerCareerSavedListener } from './services/career-saved-listener';
/** [커리어 정보] 진입 행 노출 판정 — GLOBAL 시장은 숨긴다(PM 확정 2026-10-18). 프로필·설정이 함께 쓴다 */
export { isCareerEntryVisible } from './services/career-visibility';
/**
 * dev mock 전용 — 커리어 상태의 mock 원본은 이 feature 하나다(실서버의 users 행처럼).
 * getCareerMockSummary는 프로필 mock의 career 요약이, seedCareerMockFromOnboarding은
 * 온보딩 커리어 단계 저장이 쓴다(interest mock 공용과 같은 패턴).
 */
export { getCareerMockSummary, seedCareerMockFromOnboarding } from './api/career.mock';
