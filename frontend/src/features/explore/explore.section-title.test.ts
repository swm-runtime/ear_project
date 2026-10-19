import { describe, expect, it } from '@jest/globals';

import { resolveSectionTitle } from './explore.section-title';

describe('resolveSectionTitle — 탐색 섹션 제목(KAN-194, 한국어 표시)', () => {
  it('아는 종류는 앱 문구 — 한국어는 서버 문자열과 같다', () => {
    expect(resolveSectionTitle({ sectionKey: 'interest', title: '관심사에 맞는 추천' })).toBe(
      '관심사에 맞는 추천',
    );
    expect(resolveSectionTitle({ sectionKey: 'new', title: '새로 나온 콘텐츠' })).toBe(
      '새로 나온 콘텐츠',
    );
    expect(resolveSectionTitle({ sectionKey: 'popular', title: '인기 콘텐츠' })).toBe(
      '인기 콘텐츠',
    );
  });

  it('주제 섹션은 서버가 준 주제 이름 그대로', () => {
    expect(resolveSectionTitle({ sectionKey: 'topic_group', title: '경제 상식' })).toBe(
      '경제 상식',
    );
  });

  it('모르는 종류는 서버 제목 그대로 — 서버가 배포 없이 섹션을 더할 수 있다', () => {
    expect(resolveSectionTitle({ sectionKey: 'series', title: '이어 듣는 시리즈' })).toBe(
      '이어 듣는 시리즈',
    );
  });

  it('Object 원형의 이름(constructor 등)을 종류로 착각하지 않는다', () => {
    expect(resolveSectionTitle({ sectionKey: 'constructor', title: '서버 제목' })).toBe(
      '서버 제목',
    );
  });
});
