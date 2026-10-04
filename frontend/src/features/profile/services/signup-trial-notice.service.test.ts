import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import type { PlanTrial } from '../profile.types';
import {
  markSignupTrialNoticeSeen,
  readSignupTrialNoticeSeenUserId,
  shouldShowSignupTrialNotice,
} from './signup-trial-notice.service';

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
    remove: async (key: string) => {
      mockMemory.delete(key);
    },
  },
}));

// 실패 경로의 debug 로그가 테스트 출력을 덮지 않게 한다
jest.mock('@/shared/lib/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const TRIAL: PlanTrial = {
  endsAt: '2026-10-09T19:00:00.000Z',
  lastFreeDate: '2026-10-09',
  dailyPlayLimitAfter: 2,
};

beforeEach(() => {
  mockMemory.clear();
  mockState.shouldThrow = false;
});

describe('signup-trial-notice.service', () => {
  describe('shouldShowSignupTrialNotice', () => {
    it('체험 값이 있고 이 기기에서 아무도 보지 않았으면 띄운다', () => {
      expect(shouldShowSignupTrialNotice({ trial: TRIAL, userId: 'u1', seenUserId: null })).toBe(
        true,
      );
    });

    it('plan.trial이 null이면(스위치 꺼짐·체험 종료) 띄우지 않는다', () => {
      expect(shouldShowSignupTrialNotice({ trial: null, userId: 'u1', seenUserId: null })).toBe(
        false,
      );
    });

    it('같은 계정이 이미 봤으면 다시 띄우지 않는다', () => {
      expect(shouldShowSignupTrialNotice({ trial: TRIAL, userId: 'u1', seenUserId: 'u1' })).toBe(
        false,
      );
    });

    it('같은 기기에서 다른 계정이 새로 가입하면 그 계정에는 띄운다', () => {
      expect(shouldShowSignupTrialNotice({ trial: TRIAL, userId: 'u2', seenUserId: 'u1' })).toBe(
        true,
      );
    });
  });

  describe('기기 로컬 기록', () => {
    it('닫으면 계정 id를 기록하고, 다음 실행에서 그 값을 읽는다', async () => {
      // given
      await markSignupTrialNoticeSeen('u1');
      // when
      const seen = await readSignupTrialNoticeSeenUserId();
      // then
      expect(seen).toBe('u1');
      expect(mockMemory.get(STORAGE_KEYS.SIGNUP_TRIAL_NOTICE_SEEN)).toBe('u1');
    });

    it('저장소를 읽지 못하면 아무도 안 본 것으로 읽는다 — 영영 못 보는 쪽보다 한 번 더 보는 쪽이 낫다', async () => {
      // given
      mockState.shouldThrow = true;
      // when
      const seen = await readSignupTrialNoticeSeenUserId();
      // then
      expect(seen).toBeNull();
    });

    it('기록에 실패해도 예외를 던지지 않는다 — 이번 실행은 화면 상태로 닫혀 있다', async () => {
      mockState.shouldThrow = true;
      await expect(markSignupTrialNoticeSeen('u1')).resolves.toBeUndefined();
    });
  });
});
