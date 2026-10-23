import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ERROR_CODES } from '@/shared/api/error-codes';

import { mockFetchSearch } from './explore.mock';

jest.mock('@/features/library', () => ({
  getMockLibraryItemByContentId: () => null,
  mockSaveLibraryItemByContent: jest.fn(),
  mockUnsaveLibraryItemByContent: jest.fn(),
}));
jest.mock('@/features/player', () => ({
  getMockSourceUrl: () => null,
  isMockCountedToday: () => false,
  mockPlayLimitFields: () => ({}),
}));

/** 응답 지연(600ms)을 기다리지 않고 검색 결과를 받는다 */
const search = async (query: string) => {
  const pending = mockFetchSearch({ query });
  await jest.advanceTimersByTimeAsync(1000);
  return pending;
};

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('explore mock 검색 — 해시태그 매칭(KAN-218 서버 대역, KAN-219)', () => {
  it('`#태그`는 태그와 정확히 같은 콘텐츠만 낸다', async () => {
    // when
    const response = await search('#뱅크런');

    // then
    expect(response.items.length).toBeGreaterThan(0);
    expect(
      response.items.every(
        (item) => item.type !== 'series' && item.content.tags?.includes('뱅크런'),
      ),
    ).toBe(true);
  });

  it('`#`을 뗀 값이 태그의 일부일 뿐이면 빈 결과 + fallback 이다(정확 일치)', async () => {
    // when
    const response = await search('#뱅크');

    // then
    expect(response.items).toEqual([]);
    expect(response.fallback).not.toBeNull();
  });

  it('일반 질의는 태그 부분 일치도 매칭한다', async () => {
    // when
    const response = await search('뱅크');

    // then
    expect(response.items.length).toBeGreaterThan(0);
    expect(
      response.items.every(
        (item) => item.type !== 'series' && item.content.tags?.some((tag) => tag.includes('뱅크')),
      ),
    ).toBe(true);
  });

  it.each(['#', '#a'])('`%s`는 서버 방어선과 같이 VALIDATION_FAILED 다', async (query) => {
    // when
    const pending = mockFetchSearch({ query });
    const assertion = expect(pending).rejects.toMatchObject({
      errorCode: ERROR_CODES.VALIDATION_FAILED,
    });
    await jest.advanceTimersByTimeAsync(1000);

    // then
    await assertion;
  });
});

describe('explore mock 검색 — 오타 "대신 검색"·하이브리드 필드(KAN-238 서버 대역, KAN-239)', () => {
  it('키워드 0건인 오타는 교정어로 대신 검색한다 — query_used·corrected_from 을 싣고 결과는 keyword 다', async () => {
    // when — "커리오"는 어느 제목·태그에도 없고 "커리어"(주제명·제목 토큰)와 자모 한 글자 차이다
    const response = await search('커리오');

    // then
    expect(response.items.length).toBeGreaterThan(0);
    expect(response.query_used).toBe('커리어');
    expect(response.corrected_from).toBe('커리오');
    expect(response.match).toBe('keyword');
    expect(response.fallback).toBeNull();
    expect(response.items.every((item) => item.matched_by?.includes('keyword'))).toBe(true);
  });

  it('exact=true 면 교정하지 않는다 — 빈 결과 + fallback, corrected_from 은 null', async () => {
    // when
    const pending = mockFetchSearch({ query: '커리오', exact: true });
    await jest.advanceTimersByTimeAsync(1000);
    const response = await pending;

    // then
    expect(response.items).toEqual([]);
    expect(response.fallback).not.toBeNull();
    expect(response.corrected_from).toBeNull();
    expect(response.query_used).toBe('커리오');
  });

  it('키워드 결과가 있는 질의는 교정하지 않는다(종전 결과 그대로) — 응답에 match·engines 가 붙는다', async () => {
    // when
    const response = await search('커리어');

    // then
    expect(response.items.length).toBeGreaterThan(0);
    expect(response.corrected_from).toBeNull();
    expect(response.query_used).toBe('커리어');
    expect(response.match).toBe('keyword');
    expect(response.engines).toEqual(['keyword', 'semantic']);
  });

  it('태그 전용 검색(`#`)은 교정도 의미 엔진도 없다', async () => {
    // when — "#뱅크론"은 태그 "뱅크런"의 오타지만 `#` 질의라 정확 일치만 본다
    const response = await search('#뱅크론');

    // then
    expect(response.items).toEqual([]);
    expect(response.corrected_from).toBeNull();
    expect(response.engines).toEqual(['keyword']);
  });

  it('교정 응답의 커서 페이지도 같은 교정어로 이어진다', async () => {
    // given — "이야기"의 오타 "이야끼"는 25건 → 2페이지
    const first = await search('이야끼');
    expect(first.corrected_from).toBe('이야끼');
    expect(first.has_next).toBe(true);

    // when
    const pending = mockFetchSearch({ query: '이야끼', cursor: first.next_cursor ?? undefined });
    await jest.advanceTimersByTimeAsync(1000);
    const second = await pending;

    // then
    expect(second.query_used).toBe(first.query_used);
    expect(second.corrected_from).toBe('이야끼');
    expect(second.items.length).toBeGreaterThan(0);
  });
});
