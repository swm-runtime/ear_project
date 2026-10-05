import { afterEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthTokens, AuthUser } from '../auth.types';

const LOCKED = new Error(
  "Calling the 'getValueWithKeyAsync' function has failed\n→ Caused by: User interaction is not allowed.",
);

const EXPIRES_AT = '2026-10-05T00:30:00.000Z';

const setup = () => {
  jest.resetModules();
  const values = new Map<string, string>();
  const storage = {
    get: jest.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    }),
    remove: jest.fn((key: string) => {
      values.delete(key);
      return Promise.resolve();
    }),
  };
  const getDeviceId = jest.fn(() => Promise.resolve('device-1'));
  const refreshSession = jest.fn(
    (_input: { refreshToken: string; deviceId: string }): Promise<AuthTokens> =>
      Promise.resolve({ accessToken: 'access-2', refreshToken: 'refresh-2', accessTokenExpiresAt: EXPIRES_AT }),
  );
  /** 전경 복귀 콜백 — 테스트가 직접 불러 전경 전환을 흉내 낸다 */
  const onActive: (() => void)[] = [];

  jest.doMock('@/shared/storage/secure-storage', () => ({ secureStorage: storage }));
  jest.doMock('@/shared/lib/device-id', () => ({ getDeviceId }));
  jest.doMock('@/shared/lib/app-active', () => ({
    runWhenAppActive: (callback: () => void) => {
      onActive.push(callback);
      return () => {
        const index = onActive.indexOf(callback);
        if (index >= 0) onActive.splice(index, 1);
      };
    },
  }));
  jest.doMock('@/shared/analytics', () => ({ track: jest.fn() }));
  jest.doMock('@/shared/lib/logger', () => ({
    logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));
  jest.doMock('../api/auth.api', () => ({
    getCurrentUser: jest.fn(),
    refreshSession,
    requestLogout: jest.fn(),
  }));

  const { sessionService } = jest.requireActual<typeof import('./session.service')>('./session.service');
  const { useSessionStore } = jest.requireActual<typeof import('../store/session.store')>(
    '../store/session.store',
  );
  const fireActive = () => onActive.splice(0).forEach((callback) => callback());
  return { sessionService, useSessionStore, storage, values, getDeviceId, refreshSession, fireActive };
};

const signIn = async (ctx: ReturnType<typeof setup>) => {
  await ctx.sessionService.startSession(
    { accessToken: 'access-1', refreshToken: 'refresh-1', accessTokenExpiresAt: EXPIRES_AT },
    { id: 'u1', onboardingCompleted: true, provider: 'google' } as AuthUser,
  );
};

afterEach(() => {
  jest.resetModules();
});

describe('SessionService 토큰 갱신 — iOS 기기 잠금', () => {
  it('키체인이 잠겨 기기 id 를 못 읽으면 서버를 부르지 않고 미룸을 주며 세션을 지우지 않는다', async () => {
    // given
    const ctx = setup();
    await signIn(ctx);
    ctx.getDeviceId.mockRejectedValueOnce(LOCKED);

    // when
    const result = await ctx.sessionService.refreshTokens();

    // then
    expect(result).toBe('deferred');
    expect(ctx.refreshSession).not.toHaveBeenCalled();
    expect(ctx.useSessionStore.getState().status).toBe('authenticated');
    expect(ctx.values.get('auth.refresh_token')).toBe('refresh-1');
  });

  it('잠금 때문에 미뤘던 갱신은 잠금이 풀린 뒤 다시 부르면 같은 토큰으로 성공한다', async () => {
    // given
    const ctx = setup();
    await signIn(ctx);
    ctx.getDeviceId.mockRejectedValueOnce(LOCKED);
    await ctx.sessionService.refreshTokens();

    // when
    const result = await ctx.sessionService.refreshTokens();

    // then
    expect(result).toBe('refreshed');
    expect(ctx.refreshSession).toHaveBeenCalledWith({ refreshToken: 'refresh-1', deviceId: 'device-1' });
  });

  it('새 토큰을 잠금 때문에 못 쓰면 메모리 토큰으로 계속 쓰고, 전경이 되면 회전된 토큰을 저장한다', async () => {
    // given
    const ctx = setup();
    await signIn(ctx);
    ctx.storage.set.mockImplementation(() => Promise.reject(LOCKED));

    // when
    const result = await ctx.sessionService.refreshTokens();
    const accessWhileLocked = await ctx.sessionService.getAccessToken();
    ctx.storage.set.mockImplementation((key: string, value: string) => {
      ctx.values.set(key, value);
      return Promise.resolve();
    });
    ctx.fireActive();
    await new Promise((resolve) => setImmediate(resolve));

    // then
    expect(result).toBe('refreshed');
    expect(accessWhileLocked).toBe('access-2');
    expect(ctx.values.get('auth.refresh_token')).toBe('refresh-2');
    expect(ctx.values.get('auth.access_token')).toBe('access-2');
  });

  it('저장을 기다리던 중 세션이 정리되면 전경이 되어도 토큰을 되살리지 않는다', async () => {
    // given
    const ctx = setup();
    await signIn(ctx);
    ctx.storage.set.mockImplementation(() => Promise.reject(LOCKED));
    await ctx.sessionService.refreshTokens();

    // when
    await ctx.sessionService.clearSession();
    ctx.storage.set.mockClear();
    ctx.storage.set.mockImplementation((key: string, value: string) => {
      ctx.values.set(key, value);
      return Promise.resolve();
    });
    ctx.fireActive();
    await new Promise((resolve) => setImmediate(resolve));

    // then
    expect(ctx.values.has('auth.refresh_token')).toBe(false);
    expect(ctx.storage.set).not.toHaveBeenCalled();
  });

  it('서버가 갱신을 거절하면 종전처럼 만료를 준다', async () => {
    // given
    const ctx = setup();
    await signIn(ctx);
    ctx.refreshSession.mockRejectedValueOnce(new Error('401'));

    // when
    const result = await ctx.sessionService.refreshTokens();

    // then
    expect(result).toBe('expired');
  });
});

describe('SessionService 세션 복원 — iOS 기기 잠금', () => {
  it('잠긴 채로 실행돼 토큰을 못 읽으면 지우지 않고 전경이 될 때 다시 복원한다', async () => {
    // given
    const ctx = setup();
    ctx.values.set('auth.refresh_token', 'refresh-1');
    ctx.storage.get.mockRejectedValueOnce(LOCKED);

    // when
    await ctx.sessionService.restoreSession();
    const statusWhileLocked = ctx.useSessionStore.getState().status;

    // then
    expect(statusWhileLocked).toBe('restoring');
    expect(ctx.storage.remove).not.toHaveBeenCalled();
    expect(ctx.values.get('auth.refresh_token')).toBe('refresh-1');
  });
});
