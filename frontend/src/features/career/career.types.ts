/**
 * 연차 구간 enum — 서버 계약 값 그대로 쓴다(career-api.md 2장, 정수 연차 금지).
 * 온보딩 커리어 단계(O4)와 같은 값 체계다(career.md 3장) — 두 화면이 같은 users 컬럼에 쓴다.
 */
export type YearsOfExperienceRange = '0-1' | '2-3' | '4-6' | '7+';

/**
 * GET/PUT /users/me/career의 도메인 모델. **미입력은 null이다** — 빈 문자열을 미입력 표현으로
 * 쓰지 않는다(career-api.md 2장). 셋 다 null이면 미입력 사용자다.
 */
export interface CareerInfo {
  jobCategory: string | null;
  jobTitle: string | null;
  yearsOfExperience: YearsOfExperienceRange | null;
}

/**
 * GET /job-categories 항목 — `name` 하나가 표시·전송·저장 값 전부다(career-api.md 4.3 —
 * 코드·라벨 분리 없음). 배열 순서가 곧 노출 순서라 클라이언트는 정렬하지 않는다.
 */
export interface JobCategory {
  name: string;
}
