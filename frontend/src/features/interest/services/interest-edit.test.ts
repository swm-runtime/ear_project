/**
 * 관심사 편집 판정 로직 테스트(convention.md 7.2 — 저장 분기·변경 개수는 화면 규칙의 재료다).
 * 규칙 소유: interest-management.md 4.2·7장 · interest-management-uiux.md 4.3.
 */
import { describe, expect, it } from '@jest/globals';

import { computeInterestDiff, filterToVisible } from './interest-edit';

describe('computeInterestDiff', () => {
  it('추가만 있으면 추가 목록만 채워지고 해제 목록은 빈다', () => {
    // given — 서버 저장본 [a], 화면 선택 [a, b]
    const diff = computeInterestDiff(['a'], ['a', 'b']);
    // then — 확인 팝업 없이 바로 저장되는 분기의 판정 재료다(interest-management.md 4.2)
    expect(diff.addedIds).toEqual(['b']);
    expect(diff.removedIds).toEqual([]);
    expect(diff.changeCount).toBe(1);
  });

  it('해제가 포함되면 해제 목록이 채워진다 — 확인 팝업 분기의 판정 재료', () => {
    // given — [a, b]에서 b를 해제하고 c를 추가
    const diff = computeInterestDiff(['a', 'b'], ['a', 'c']);
    // then — 추가 1 + 해제 1 = 변경 사항 2개(interest-management-uiux.md 4.3 예시와 동일)
    expect(diff.addedIds).toEqual(['c']);
    expect(diff.removedIds).toEqual(['b']);
    expect(diff.changeCount).toBe(2);
  });

  it('해제했다가 같은 편집 안에서 다시 선택하면 변경 없음(0)이다', () => {
    // given — 조작은 있었지만 결과가 서버 저장본과 같다
    const diff = computeInterestDiff(['a', 'b'], ['b', 'a']);
    // then — 조작 횟수가 아니라 결과의 차이를 센다. 순서 차이도 변경이 아니다
    expect(diff.changeCount).toBe(0);
    expect(diff.addedIds).toEqual([]);
    expect(diff.removedIds).toEqual([]);
  });

  it('전부 해제하면 해제 개수만큼 변경으로 센다 — 0개 상태도 편집으로 취급한다', () => {
    // given — 0개 상태는 허용하되 저장만 막는다(interest-management.md 4.2)
    const diff = computeInterestDiff(['a', 'b'], []);
    // then — 뒤로가기 시 이탈 확인 팝업이 뜨는 근거(변경 있음)가 된다
    expect(diff.removedIds).toEqual(['a', 'b']);
    expect(diff.changeCount).toBe(2);
  });

  describe('filterToVisible과의 조합 — 숨겨진 주제는 판정 범위에서 제외한다', () => {
    it('관리자가 숨긴 주제는 개수·diff 어디에도 나타나지 않는다', () => {
      // given — 선택에 숨겨진 주제 hidden이 섞여 있다(노출 목록은 a·b뿐)
      const visible = new Set(['a', 'b']);
      const baseline = filterToVisible(['a'], visible);
      const selected = filterToVisible(['a', 'hidden'], visible);
      // then — 사용자가 하지 않은 해제·추가가 기록되지 않는다(interest-management.md 7장)
      expect(selected).toEqual(['a']);
      expect(computeInterestDiff(baseline, selected).changeCount).toBe(0);
    });
  });
});
