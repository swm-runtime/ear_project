/**
 * 커리어 정보 진입 행 노출 판정 테스트 — 규칙 소유: profile.md 4.4 · settings.md 4.1(PM 확정 2026-10-18).
 */
import { describe, expect, it } from '@jest/globals';

import { isCareerEntryVisible } from './career-visibility';

describe('isCareerEntryVisible', () => {
  it('KR 시장 계정에는 커리어 정보 진입 행을 보여 준다', () => {
    expect(isCareerEntryVisible('kr')).toBe(true);
  });

  it('GLOBAL 시장 계정에는 커리어 정보 진입 행을 두지 않는다(PM 확정 2026-10-18)', () => {
    expect(isCareerEntryVisible('global')).toBe(false);
  });
});
