import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import {
  markAutoExpandNoticeSeen,
  readAutoExpandNoticeSeenUserId,
  shouldShowAutoExpandNotice,
} from './auto-expand-notice.service';

const mockMemory = new Map<string, string>();
const mockState = { shouldThrow: false };
jest.mock('@/shared/storage/secure-storage', () => ({
  secureStorage: {
    get: async (key: string) => {
      if (mockState.shouldThrow) throw new Error('keychain unavailable');
      return mockMemory.get(key) ?? null;
    },
    set: async (key: string, value: string) => {
      if (mockState.shouldThrow) throw new Error('keychain unavailable');
      mockMemory.set(key, value);
    },
  },
}));

// 실패 경로의 debug 로그가 테스트 출력을 덮지 않게 한다
jest.mock('@/shared/lib/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

beforeEach(() => {
  mockMemory.clear();
  mockState.shouldThrow = false;
});

describe('auto-expand-notice.service', () => {
  describe('shouldShowAutoExpandNotice', () => {
    it('자동 추가 주제가 있고 이 계정이 아직 안 봤으면 띄운다', () => {
      expect(
        shouldShowAutoExpandNotice({ hasAutoExpand: true, userId: 'u1', seenUserId: null }),
      ).toBe(true);
    });

    it('자동 추가 주제가 없으면 띄우지 않는다', () => {
      expect(
        shouldShowAutoExpandNotice({ hasAutoExpand: false, userId: 'u1', seenUserId: null }),
      ).toBe(false);
    });

    it('이 계정이 이미 봤으면 띄우지 않는다', () => {
      expect(
        shouldShowAutoExpandNotice({ hasAutoExpand: true, userId: 'u1', seenUserId: 'u1' }),
      ).toBe(false);
    });

    it('다른 계정이 봤던 것은 이 계정에는 영향을 주지 않는다', () => {
      expect(
        shouldShowAutoExpandNotice({ hasAutoExpand: true, userId: 'u2', seenUserId: 'u1' }),
      ).toBe(true);
    });
  });

  describe('read/mark', () => {
    it('기록한 계정 id를 그대로 읽어 온다', async () => {
      await markAutoExpandNoticeSeen('u1');
      expect(mockMemory.get(STORAGE_KEYS.INTEREST_AUTO_EXPAND_NOTICE_SEEN)).toBe('u1');
      await expect(readAutoExpandNoticeSeenUserId()).resolves.toBe('u1');
    });

    it('아무것도 기록하지 않았으면 null', async () => {
      await expect(readAutoExpandNoticeSeenUserId()).resolves.toBeNull();
    });

    it('저장소를 못 읽으면 null로 떨어진다(영영 못 보는 것보다 한 번 더 보이는 쪽)', async () => {
      mockState.shouldThrow = true;
      await expect(readAutoExpandNoticeSeenUserId()).resolves.toBeNull();
    });

    it('기록이 실패해도 예외를 밖으로 던지지 않는다', async () => {
      mockState.shouldThrow = true;
      await expect(markAutoExpandNoticeSeen('u1')).resolves.toBeUndefined();
    });
  });
});
