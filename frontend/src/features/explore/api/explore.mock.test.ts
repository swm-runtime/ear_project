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
    expect(response.items.every((item) => item.content.tags?.includes('뱅크런'))).toBe(true);
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
      response.items.every((item) => item.content.tags?.some((tag) => tag.includes('뱅크'))),
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
