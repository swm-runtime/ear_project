import { describe, expect, it } from '@jest/globals';

import { isKeychainLockedError } from './keychain-error';

describe('isKeychainLockedError', () => {
  it('expo-secure-store 가 잠금 상태에서 던지는 오류를 잠금으로 판정한다', () => {
    const error = new Error(
      "Calling the 'getValueWithKeyAsync' function has failed\n→ Caused by: User interaction is not allowed.",
    );
    expect(isKeychainLockedError(error)).toBe(true);
  });

  it('원인 사슬에 잠금 오류가 있으면 잠금으로 판정한다', () => {
    const error = new Error('FunctionCallException', {
      cause: new Error('KeyChainException: User interaction is not allowed.'),
    });
    expect(isKeychainLockedError(error)).toBe(true);
  });

  it('다른 키체인 오류는 잠금으로 판정하지 않는다 — 기다려도 풀리지 않는다', () => {
    expect(isKeychainLockedError(new Error('KeyChainException: Unable to decode the provided data.'))).toBe(false);
    expect(isKeychainLockedError(new Error('Network Error'))).toBe(false);
    expect(isKeychainLockedError(null)).toBe(false);
  });
});
