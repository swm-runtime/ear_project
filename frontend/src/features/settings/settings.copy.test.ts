import { describe, expect, it, jest } from '@jest/globals';

import { SETTINGS_COPY } from './settings.copy';

// 알림 feature 공개 API 는 플레이어(네이티브 오디오)까지 끌고 온다 — 문구 검증에는 배너 제목 하나면 된다
jest.mock('@/features/notification', () => ({
  NOTIFICATION_COPY: { prePrompt: { title: '알림을 받아 보세요' } },
}));

describe('설정 — 요금제 관리 진입 항목(KAN-146)', () => {
  it('구독 섹션의 이름은 "요금제 관리"이고, 낭독 라벨도 같은 목적지를 말한다', () => {
    // given · when · then — 진입점 이름과 화면 제목(subscription.copy title)이 같아야 한다
    expect(SETTINGS_COPY.sections.subscription).toBe('요금제 관리');
    expect(SETTINGS_COPY.plan.a11y).toBe('요금제 관리 열기');
  });
});
