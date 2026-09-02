import type { TokenProvider } from '@/shared/api/api-client';
import { getDeviceId } from '@/shared/lib/device-id';
import { logger } from '@/shared/lib/logger';
import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import { refreshSession, requestLogout } from '../api/auth.api';
import type { AuthTokens, AuthUser } from '../auth.types';
import { useSessionStore } from '../store/session.store';

/**
 * 세션 도메인 서비스(architecture.md 5.3).
 * - 토큰은 SecureStore에만 저장한다. 전역 변수·MMKV 금지.
 * - 토큰 갱신은 단일 인플라이트로 묶는다 — 동시 401에서 갱신 요청은 1개만 나간다.
 * - ApiClient에는 TokenProvider 인터페이스로 주입된다(app/bootstrap).
 */
class SessionService implements TokenProvider {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  /** 로그인·가입 성공 시 호출 — 토큰 저장 후 세션 상태를 전환한다 */
  async startSession(tokens: AuthTokens, user: AuthUser): Promise<void> {
    await this.saveTokens(tokens);
    useSessionStore.getState().setSession(user);
  }

  /**
   * 온보딩 종료(라이브러리 진입) 시점에 호출 — 서버는 완료 요청 시점에 이미 처리됐고(onboarding-api.md 4.7),
   * 로컬 세션 상태를 뒤따라 갱신해 RootNavigator가 Main으로 전환하게 한다.
   * 완료·알림 화면이 남아 있는 동안 스택이 교체되면 안 되므로 온보딩 feature가 종료 시점을 소유한다.
   */
  markOnboardingCompleted(): void {
    useSessionStore.getState().updateUser({ onboardingCompleted: true, onboardingStep: 'done' });
    // 이 진입만 탐색으로 착지시킨다 — 앱을 새로 켠 진입은 라이브러리다(2026-09-02)
    useSessionStore.getState().markJustCompletedOnboarding();
  }

  /** 로컬 토큰·세션 상태 정리. TODO: 라이브러리 캐시·재생 위치·오프라인 큐 삭제는 해당 feature 구현 시 연결(auth.md 4.2) */
  async clearSession(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    await Promise.all([
      secureStorage.remove(STORAGE_KEYS.ACCESS_TOKEN),
      secureStorage.remove(STORAGE_KEYS.REFRESH_TOKEN),
    ]);
    useSessionStore.getState().clearSession();
  }

  /** 로그아웃 — 서버 호출이 실패해도 로컬 정리를 진행한다(auth.md 4.2) */
  async logout(): Promise<void> {
    try {
      const deviceId = await getDeviceId();
      await requestLogout({ deviceId });
    } catch (error) {
      logger.debug('[session] logout request failed, proceeding locally', error);
    }
    await this.clearSession();
  }

  async getAccessToken(): Promise<string | null> {
    if (this.accessToken) return this.accessToken;
    this.accessToken = await secureStorage.get(STORAGE_KEYS.ACCESS_TOKEN);
    return this.accessToken;
  }

  refreshTokens(): Promise<boolean> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  /** 갱신 실패 시 즉시 로컬 세션 정리 → 시작 화면(재갱신 루프 금지 — architecture.md 5.3) */
  onSessionExpired(): void {
    void this.clearSession().catch((error) => {
      logger.error('[session] failed to clear session', error);
    });
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = this.refreshToken ?? (await secureStorage.get(STORAGE_KEYS.REFRESH_TOKEN));
    if (!refreshToken) return false;

    try {
      const deviceId = await getDeviceId();
      const tokens = await refreshSession({ refreshToken, deviceId });
      await this.saveTokens(tokens);
      return true;
    } catch {
      return false;
    }
  }

  private async saveTokens(tokens: AuthTokens): Promise<void> {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    await Promise.all([
      secureStorage.set(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken),
      secureStorage.set(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken),
    ]);
  }
}

export const sessionService = new SessionService();
