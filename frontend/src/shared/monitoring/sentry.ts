import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { APP_VERSION, IS_DEV_API } from '@/shared/lib/app-version';
import { logger } from '@/shared/lib/logger';

import { isExpectedError, scrubEvent } from './event-filter';

/**
 * 앱 크래시·JS 오류 수집 — Sentry(KAN-92, `common-error-handling.md` 4.7).
 *
 * 서버는 UptimeRobot·CloudWatch·Slack 으로 촘촘한데 앱은 아무것도 없어서, 앱 버그를 알게 되는
 * 경로가 **스토어 리뷰뿐**이었다. 여기서 보내는 것은 **크래시와 예상 못한 예외뿐**이다 —
 * 지하철에서 앱을 켠 사람의 네트워크 실패까지 다 보내면 알림이 무의미해지고 진짜 크래시가 묻힌다.
 *
 * DSN 은 `app.config.js` 의 `extra.sentryDsn` 으로 들어온다(소셜 키와 같은 경로). 소스에 박지
 * 않는다. 값이 없으면(DSN 발급 전·웹·mock) 초기화를 건너뛰고 아무것도 보내지 않는다.
 */

const resolveDsn = (): string | null => {
  const dsn = Constants.expoConfig?.extra?.sentryDsn;
  return typeof dsn === 'string' && dsn.length > 0 ? dsn : null;
};

let isInitialized = false;

export const initSentry = (): void => {
  if (isInitialized) return;
  const dsn = resolveDsn();
  if (!dsn) {
    logger.debug('[sentry] dsn missing — crash reporting off');
    return;
  }
  isInitialized = true;

  Sentry.init({
    dsn,
    // 프리뷰 오류가 운영 통계를 오염시키지 않게 — 채널이 아니라 실제로 부르는 API 로 가른다
    environment: IS_DEV_API ? 'preview' : 'production',
    release: `ear@${APP_VERSION}`,
    sendDefaultPii: false,
    // 성능 추적은 끈다(팀 결정 2026-09-23, KAN-95) — 에러 수집 전용. `tracesSampleRate` 는 **키 자체를 두지 않는다**:
    // 0 을 넘기면 "끔"이 아니라 "켜되 표본 0" 이라 SDK 가 계측·트레이스 전파를 전부 등록한다(서버 KAN-93 과 같은 함정)
    enableAutoPerformanceTracing: false,
    beforeSend(event, hint) {
      if (isExpectedError(hint.originalException)) return null;
      return scrubEvent(event);
    },
  });
};

/** 로그인·복원 시 — id 만. 이메일·닉네임은 `scrubEvent` 가 한 번 더 지운다 */
export const setSentryUser = (userId: string | null): void => {
  if (!isInitialized) return;
  Sentry.setUser(userId ? { id: userId } : null);
};

/**
 * 잡힌 예외를 명시적으로 보낼 때 — 계약된 오류는 여기서도 걸러진다.
 * 화면·서비스에서 `logger.error` 대신 쓰지 않는다. 진짜 "이건 버그다" 지점에서만.
 */
export const reportError = (error: unknown, context?: Record<string, unknown>): void => {
  if (!isInitialized || isExpectedError(error)) return;
  Sentry.withScope((scope) => {
    if (context) scope.setContext('app', context);
    Sentry.captureException(error);
  });
};

/** 최상위 컴포넌트를 감싸 네이티브·JS 크래시와 터치 breadcrumb 를 잡는다 */
export const wrapWithSentry = Sentry.wrap;
