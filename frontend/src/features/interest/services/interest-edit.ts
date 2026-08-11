/**
 * 관심사 편집 판정의 순수 로직 — 규칙 소유: interest-management.md 7장(숨겨진 주제 제외 ·
 * 해제 후 재선택 = 변경 없음) · interest-management-uiux.md 4.3("변경 사항 N개" 산정).
 */

/**
 * 노출 중인 주제로 목록을 한정한다 — 숨겨진 주제는 diff·개수 판정 범위에서 제외한다
 * (interest-management.md 7장, 명문화 2026-08-10). 화면의 칩 수와 "N/3"의 N이 같아진다.
 */
export const filterToVisible = (
  topicIds: string[],
  visibleTopicIds: ReadonlySet<string>,
): string[] => topicIds.filter((id) => visibleTopicIds.has(id));

export interface InterestDiff {
  addedIds: string[];
  removedIds: string[];
  /** "변경 사항 N개"의 N — 추가 1·해제 1을 각각 1로 센 합계. 조작 횟수가 아니라 결과의 차이다 */
  changeCount: number;
}

/**
 * 서버 저장본(baseline)과 화면 선택의 결과 차이. 해제했다가 같은 편집 안에서 다시 선택하면
 * 변경 없음(0)이고, 순서 차이는 변경이 아니다(전체 목록 전송 — 순서에 의미가 없다).
 */
export const computeInterestDiff = (baselineIds: string[], selectedIds: string[]): InterestDiff => {
  const baseline = new Set(baselineIds);
  const selected = new Set(selectedIds);
  const addedIds = [...selected].filter((id) => !baseline.has(id));
  const removedIds = [...baseline].filter((id) => !selected.has(id));
  return { addedIds, removedIds, changeCount: addedIds.length + removedIds.length };
};
