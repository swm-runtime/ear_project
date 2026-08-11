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

/**
 * 상한 초과 저장 게이트 — 탭은 제한하지 않고 저장만 막는다(변경 2026-08-11: 0개 상태와 같은
 * 패턴). 판정식은 서버와 같은 max(상한, 저장 전 보유 개수)다(interest-management-api.md 4.3) —
 * 초과 보유자(기존 5개)의 해제·재저장(5→4)을 막지 않기 위해 상수 3을 쓰지 않는다.
 */
export const isOverSelectionCap = (
  selectedCount: number,
  maxSelectable: number,
  baselineCount: number,
): boolean => maxSelectable > 0 && selectedCount > Math.max(maxSelectable, baselineCount);
