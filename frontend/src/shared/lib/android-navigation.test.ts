import { describe, expect, it } from '@jest/globals';

import { androidNavigationModeOf } from './android-navigation';

describe('androidNavigationModeOf — 아래 안전영역 높이로 내비게이션 방식 판정', () => {
  it('48dp 안팎이면 버튼 바다', () => {
    expect(androidNavigationModeOf(48)).toBe('buttons');
    expect(androidNavigationModeOf(32)).toBe('buttons');
  });

  it('24dp 이하(핸들 숨김 0 포함)면 제스처 바다', () => {
    expect(androidNavigationModeOf(24)).toBe('gesture');
    expect(androidNavigationModeOf(16)).toBe('gesture');
    expect(androidNavigationModeOf(0)).toBe('gesture');
  });
});
