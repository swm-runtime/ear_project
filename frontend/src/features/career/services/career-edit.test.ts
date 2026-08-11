/**
 * 커리어 편집 판정 로직 테스트(convention.md 7.2 — 저장·초기화 활성과 이탈 팝업 분기의 재료다).
 * 규칙 소유: career.md 4.1·4.2 · career-uiux.md 4.1·4.2 · career-api.md 2장.
 */
import { describe, expect, it } from '@jest/globals';

import type { CareerInfo } from '../career.types';
import {
  hasCareerFormChanges,
  isCareerEmpty,
  isCareerFormEmpty,
  normalizeJobTitle,
  toCareerInfoFromForm,
  type CareerFormValues,
} from './career-edit';

const BASELINE: CareerInfo = {
  jobCategory: '기획',
  jobTitle: '서비스 기획',
  yearsOfExperience: '4-6',
};

const formOf = (overrides: Partial<CareerFormValues> = {}): CareerFormValues => ({
  jobCategory: BASELINE.jobCategory,
  jobTitle: BASELINE.jobTitle ?? '',
  yearsOfExperience: BASELINE.yearsOfExperience,
  ...overrides,
});

describe('career-edit', () => {
  describe('normalizeJobTitle', () => {
    it('공백만 입력한 직무는 null로 정규화한다', () => {
      // given / when / then
      expect(normalizeJobTitle('   ')).toBeNull();
      expect(normalizeJobTitle('')).toBeNull();
    });

    it('앞뒤 공백을 제거한 값을 돌려준다', () => {
      expect(normalizeJobTitle('  백엔드 개발자 ')).toBe('백엔드 개발자');
    });
  });

  describe('toCareerInfoFromForm', () => {
    it('초기화 후 저장 본문은 세 필드 모두 null이다', () => {
      // given
      const form = formOf({ jobCategory: null, jobTitle: '', yearsOfExperience: null });
      // when
      const body = toCareerInfoFromForm(form);
      // then — 전체 교체 계약: 비움은 키 생략이 아니라 null이다(career-api.md 4.2)
      expect(body).toEqual({ jobCategory: null, jobTitle: null, yearsOfExperience: null });
    });
  });

  describe('isCareerFormEmpty', () => {
    it('세 필드가 모두 비어 있으면 빈 폼으로 판정한다', () => {
      expect(
        isCareerFormEmpty(formOf({ jobCategory: null, jobTitle: '', yearsOfExperience: null })),
      ).toBe(true);
    });

    it('직무가 공백만이어도 빈 폼으로 판정한다', () => {
      expect(
        isCareerFormEmpty(formOf({ jobCategory: null, jobTitle: '   ', yearsOfExperience: null })),
      ).toBe(true);
    });

    it('값이 하나라도 있으면 빈 폼이 아니다', () => {
      expect(
        isCareerFormEmpty(formOf({ jobCategory: null, jobTitle: '', yearsOfExperience: '0-1' })),
      ).toBe(false);
    });
  });

  describe('hasCareerFormChanges', () => {
    it('서버 값과 같으면 변경 없음이다', () => {
      expect(hasCareerFormChanges(BASELINE, formOf())).toBe(false);
    });

    it('값을 바꾸면 변경 있음이다', () => {
      expect(hasCareerFormChanges(BASELINE, formOf({ jobCategory: '개발' }))).toBe(true);
    });

    it('값을 바꿨다가 되돌리면 변경 없음이다', () => {
      // given — 연차를 해제했다가 다시 원래 구간을 선택한 폼
      const reverted = formOf({ yearsOfExperience: '4-6' });
      // then — 탭 이력이 아니라 결과 비교다(career-uiux.md 4.1)
      expect(hasCareerFormChanges(BASELINE, reverted)).toBe(false);
    });

    it('직무의 앞뒤 공백 차이만으로는 변경으로 보지 않는다', () => {
      expect(hasCareerFormChanges(BASELINE, formOf({ jobTitle: '  서비스 기획 ' }))).toBe(false);
    });

    it('미입력 서버 값에 공백만 입력하면 변경 없음이다', () => {
      // given
      const emptyBaseline: CareerInfo = {
        jobCategory: null,
        jobTitle: null,
        yearsOfExperience: null,
      };
      // then — 공백만인 직무는 null로 정규화되어 비교된다
      expect(
        hasCareerFormChanges(
          emptyBaseline,
          formOf({ jobCategory: null, jobTitle: '  ', yearsOfExperience: null }),
        ),
      ).toBe(false);
    });

    it('값을 전부 비우면 변경 있음이다', () => {
      // given — [초기화] 직후 폼
      const cleared = formOf({ jobCategory: null, jobTitle: '', yearsOfExperience: null });
      // then — 비운 상태는 변경 있음으로 취급한다(career.md 4.1)
      expect(hasCareerFormChanges(BASELINE, cleared)).toBe(true);
    });
  });

  describe('isCareerEmpty', () => {
    it('세 필드 null이면 미입력 사용자다', () => {
      expect(
        isCareerEmpty({ jobCategory: null, jobTitle: null, yearsOfExperience: null }),
      ).toBe(true);
    });

    it('값이 하나라도 있으면 미입력이 아니다', () => {
      expect(isCareerEmpty(BASELINE)).toBe(false);
    });
  });
});
