/**
 * 주제 목록 표시 상태 판정 테스트(convention.md 7.2 — 화면 분기의 판정 재료).
 * 온보딩 1단계와 관심사 관리가 같은 판정을 쓴다. 규칙 소유: onboarding.md 7 · onboarding-api.md 4.2.
 */
import { describe, expect, it } from '@jest/globals';

import { isTopicListUnavailable } from './topic-list-state';

describe('isTopicListUnavailable', () => {
  it('조회 중에는 0건이어도 에러로 판정하지 않는다 — 아직 모르는 상태다', () => {
    // given — 첫 조회가 진행 중이라 items가 아직 비어 있다
    const isUnavailable = isTopicListUnavailable({
      isPending: true,
      isError: false,
      topicCount: 0,
    });
    // then — O5 스켈레톤을 그려야 하므로 거짓이다
    expect(isUnavailable).toBe(false);
  });

  it('조회에 실패하면 참이다 — 기존 O6 경로', () => {
    expect(isTopicListUnavailable({ isPending: false, isError: true, topicCount: 0 })).toBe(true);
  });

  it('200인데 주제가 0건이면 참이다 — 조회 실패와 같은 층으로 다룬다', () => {
    // given — 서버가 폴백을 만들지 않고 빈 목록을 정상 응답으로 내려준 상태
    const isUnavailable = isTopicListUnavailable({
      isPending: false,
      isError: false,
      topicCount: 0,
    });
    // then — 재시도할 수단이 없는 빈 화면에 갇히지 않게 O6을 그린다
    expect(isUnavailable).toBe(true);
  });

  it('주제가 1건이라도 있으면 거짓이다', () => {
    expect(isTopicListUnavailable({ isPending: false, isError: false, topicCount: 1 })).toBe(false);
  });
});
