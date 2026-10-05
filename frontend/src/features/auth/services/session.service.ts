import { track } from '@/shared/analytics';
import type { TokenProvider, TokenRefreshResult } from '@/shared/api/api-client';
import { runWhenAppActive } from '@/shared/lib/app-active';
import { getDeviceId } from '@/shared/lib/device-id';
import { logger } from '@/shared/lib/logger';
import { isKeychainLockedError } from '@/shared/storage/keychain-error';
import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import { getCurrentUser, refreshSession, requestLogout } from '../api/auth.api';
import type { AuthTokens, AuthUser, RequiredConsent } from '../auth.types';
import { useSessionStore } from '../store/session.store';

/**
 * 세션 도메인 서비스(architecture.md 5.3).
 * - 토큰은 SecureStore에만 저장한다. 전역 변수·MMKV 금지.
 * - 토큰 갱신은 단일 인플라이트로 묶는다 — 동시 401에서 갱신 요청은 1개만 나간다.
 * - ApiClient에는 TokenProvider 인터페이스로 주입된다(app/bootstrap).
 * - **iOS 기기 잠금으로 키체인이 막힌 실패는 세션 만료가 아니다**(architecture.md 5.3·7.2, 2026-10-05). 잠금 화면에서
 *   재생하는 동안 토큰 갱신이 키체인을 못 읽으면 판정을 미루고(`deferred`), 새 토큰을 못 쓰면 메모리 토큰으로 계속
 *   쓰다가 전경이 되면 저장한다.
 */
class SessionService implements TokenProvider {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<TokenRefreshResult> | null = null;
  /** 잠금 때문에 저장하지 못한 토큰이 메모리에만 있다 — 전경이 되면 저장한다 */
  private hasPendingPersist = false;
  private cancelPendingPersist: (() => void) | null = null;

  /**
   * 앱 시작 시 1회 — 저장된 토큰으로 세션을 되살린다(`splash.md` 4의 2·3단계 판정 입력).
   *
   * 토큰이 없으면 **서버를 부르지 않고** 곧바로 미로그인으로 확정한다. 있으면
   * `GET /users/me`(auth-api.md 4.13)로 사용자와 `pending_consents` 를 한 번에 받는다 —
   * access token 이 만료됐으면 ApiClient 인터셉터가 갱신을 한 번 시도하고(단일 인플라이트),
   * 그래도 실패하면 401 이 올라와 여기서 세션을 정리한다.
   *
   * **실패는 조용히 미로그인으로 떨어뜨린다.** 토큰 만료는 오류가 아니라 정상 경로이고,
   * 재시도를 유도하면 갱신 루프가 된다(architecture.md 5.3 · auth-api.md 4.3).
   */
  async restoreSession(): Promise<void> {
    await this.restore(true);
  }

  /**
   * 잠긴 채로 실행됐으면(백그라운드 실행 — 키체인을 못 읽는다) 전경이 될 때 **한 번** 다시 읽는다. 그동안은 `restoring`
   * 그대로라 스플래시에 머문다. 다시 읽어도 못 읽으면 미로그인으로 시작하되 **저장된 토큰은 지우지 않는다** —
   * 읽지 못한 것이지 없는 것이 아니다. 다음 실행에서 다시 복원된다.
   */
  private async restore(canWaitForUnlock: boolean): Promise<void> {
    let refreshToken: string | null;
    try {
      refreshToken = this.refreshToken ?? (await secureStorage.get(STORAGE_KEYS.REFRESH_TOKEN));
    } catch (error) {
      if (canWaitForUnlock && isKeychainLockedError(error)) {
        logger.debug('[session] keychain locked at restore, waiting for foreground');
        runWhenAppActive(() => {
          void this.restore(false);
        });
        return;
      }
      logger.warn('[session] stored token unreadable, starting signed out', error);
      useSessionStore.getState().clearSession();
      return;
    }
    if (!refreshToken) {
      useSessionStore.getState().clearSession();
      return;
    }
    this.refreshToken = refreshToken;

    try {
      const { user, pendingConsents } = await getCurrentUser();
      useSessionStore.getState().setSession(user, pendingConsents);
    } catch (error) {
      logger.debug('[session] restore failed, starting signed out', error);
      await this.clearSession();
    }
  }

  /** 로그인·가입 성공 시 호출 — 토큰 저장 후 세션 상태를 전환한다 */
  async startSession(
    tokens: AuthTokens,
    user: AuthUser,
    /** 로그인 응답의 pending_consents — 있으면 관문이 A20을 먼저 태운다(auth.md 7) */
    pendingConsents: RequiredConsent[] = [],
  ): Promise<void> {
    await this.saveTokens(tokens);
    // 온보딩을 안 끝낸 세션 시작 = 가입 직후(A20 동의 완료 뒤)로 본다 — 서버에 신규 플래그가 없다
    track(user.onboardingCompleted ? 'login' : 'sign_up', { method: user.provider });
    useSessionStore.getState().setSession(user, pendingConsents);
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
    // 저장을 기다리던 토큰이 정리 뒤에 되살아나면 안 된다
    this.hasPendingPersist = false;
    this.cancelPendingPersist?.();
    this.cancelPendingPersist = null;
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
    try {
      this.accessToken = await secureStorage.get(STORAGE_KEYS.ACCESS_TOKEN);
    } catch (error) {
      if (!isKeychainLockedError(error)) throw error;
      // 잠겨서 못 읽었다 — 토큰 없이 보내 401 → 갱신 경로(메모리의 refresh token)가 판정하게 둔다
      return null;
    }
    return this.accessToken;
  }

  refreshTokens(): Promise<TokenRefreshResult> {
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

  /**
   * 갱신 1회. 키체인 읽기(refresh token·기기 id)가 **기기 잠금**에 걸리면 서버를 부르지 않고 `deferred` 를 준다 —
   * 세션을 지우지 않고 원 요청만 실패한다. 서버를 부르기 전이라 refresh token 이 회전되지 않으므로 다음 401 이
   * 같은 토큰으로 다시 시도할 수 있다. 자동 재시도는 하지 않는다(재갱신 루프 금지 — architecture.md 5.3).
   */
  private async doRefresh(): Promise<TokenRefreshResult> {
    let refreshToken: string | null;
    let deviceId: string;
    try {
      refreshToken = this.refreshToken ?? (await secureStorage.get(STORAGE_KEYS.REFRESH_TOKEN));
      if (!refreshToken) return 'expired';
      deviceId = await getDeviceId();
    } catch (error) {
      if (isKeychainLockedError(error)) {
        logger.debug('[session] keychain locked, token refresh deferred');
        return 'deferred';
      }
      return 'expired';
    }

    try {
      const tokens = await refreshSession({ refreshToken, deviceId });
      await this.saveTokens(tokens);
      return 'refreshed';
    } catch {
      return 'expired';
    }
  }

  /**
   * 메모리에 먼저 올리고 키체인에 쓴다. 쓰기가 **기기 잠금**에 걸리면 던지지 않고 메모리 토큰으로 계속 쓰다가 전경이
   * 되면 다시 쓴다. 서버는 갱신마다 refresh token 을 회전하고 옛 토큰을 폐기한다 — 옛 토큰이 키체인에 남은 채 앱이
   * 끝나면 다음 실행의 갱신이 재사용 탐지에 걸려 **이 사용자의 모든 세션이 폐기된다**(backend `auth.service.ts` refresh).
   */
  private async saveTokens(tokens: AuthTokens): Promise<void> {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    try {
      await this.persistTokens(tokens.accessToken, tokens.refreshToken);
    } catch (error) {
      if (!isKeychainLockedError(error)) throw error;
      logger.debug('[session] keychain locked, token persist deferred to foreground');
      this.schedulePersist();
    }
  }

  private async persistTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([
      secureStorage.set(STORAGE_KEYS.ACCESS_TOKEN, accessToken),
      secureStorage.set(STORAGE_KEYS.REFRESH_TOKEN, refreshToken),
    ]);
  }

  private schedulePersist(): void {
    if (this.hasPendingPersist) return;
    this.hasPendingPersist = true;
    this.cancelPendingPersist = runWhenAppActive(() => {
      void this.flushPendingPersist();
    });
  }

  /** 전경이 된 시점의 메모리 토큰을 쓴다. 전경에서도 실패하면 다시 예약하지 않는다(다음 갱신의 저장이 덮는다) */
  private async flushPendingPersist(): Promise<void> {
    if (!this.hasPendingPersist) return;
    this.hasPendingPersist = false;
    this.cancelPendingPersist = null;
    const { accessToken, refreshToken } = this;
    if (!accessToken || !refreshToken) return;
    try {
      await this.persistTokens(accessToken, refreshToken);
    } catch (error) {
      logger.warn('[session] deferred token persist failed', error);
    }
  }
}

export const sessionService = new SessionService();
