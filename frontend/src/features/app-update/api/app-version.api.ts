import { apiClient } from '@/shared/api/api-client';
import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import type { DevicePlatform } from '@/shared/lib/device-platform';
import { logger } from '@/shared/lib/logger';

import { IS_APP_VERSION_API_MOCKED, VERSION_GATE_TIMEOUT_MS } from '../app-update.constants';
import type { AppVersionResponseDto, VersionGateVerdict } from './app-version.dto';
import { mockFetchAppVersion } from './app-version.mock';

/**
 * 스플래시 버전 관문(settings-api.md 4.6 `GET /app/version`) — **인증 없음**, 로그인 전에 부른다.
 *
 * 판정은 서버가 한다 — 200 이면 통과, 426 `APP_UPDATE_REQUIRED` 면 강제 업데이트. 앱은 버전을 비교하지 않는다(splash.md 4.1).
 * 그 밖의 실패(망·5xx·타임아웃)는 `unknown` — 막지 않는다(fail-open, README 결정 39). 자동 재시도(1초→3초)를 끄는 이유:
 * 재시도까지 기다리면 관문이 로고 모션보다 길어지는데 결과가 `unknown` 이어도 통과라 기다릴 가치가 없다
 */
export const fetchVersionGate = async (input: {
  appVersion: string;
  platform: DevicePlatform;
}): Promise<VersionGateVerdict> => {
  try {
    const data = IS_APP_VERSION_API_MOCKED
      ? await mockFetchAppVersion()
      : (
          await apiClient.get<AppVersionResponseDto>('/app/version', {
            params: { app_version: input.appVersion, platform: input.platform },
            timeout: VERSION_GATE_TIMEOUT_MS,
            skipAuthRefresh: true,
            noAutoRetry: true,
          })
        ).data;
    return { kind: 'ok', updateAvailable: data.update_available, latestVersion: data.latest_version };
  } catch (error) {
    if (isApiError(error) && error.errorCode === ERROR_CODES.APP_UPDATE_REQUIRED) {
      return { kind: 'required' };
    }
    // 판정 불가 — 원인만 남긴다(warn). 400 VALIDATION_FAILED 도 여기로 온다: 잘못된 형식으로 전원을 막지 않는다
    logger.warn('[app-update] version gate unavailable', {
      error_code: isApiError(error) ? error.errorCode : 'unknown',
      http_status: isApiError(error) ? error.httpStatus : null,
    });
    return { kind: 'unknown' };
  }
};
