import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type { AppVersionResponseDto } from './app-version.dto';

/**
 * 시나리오 전환(EXPO_PUBLIC_APP_VERSION_MOCK_SCENARIO):
 * - `ok`(기본) 최신 — 아무 안내 없음
 * - `recommend` 최소 이상·최신 미만 — 권장 안내
 * - `required` 최소 미만 — 426 강제 업데이트
 * - `fail` 망 오류 — fail-open 으로 통과해야 한다
 */
const SCENARIO = process.env.EXPO_PUBLIC_APP_VERSION_MOCK_SCENARIO ?? 'ok';
const MOCK_LATENCY_MS = 200;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const mockFetchAppVersion = async (): Promise<AppVersionResponseDto> => {
  await delay(MOCK_LATENCY_MS);
  switch (SCENARIO) {
    case 'required':
      throw new ApiError(
        ERROR_CODES.APP_UPDATE_REQUIRED,
        '새 버전으로 업데이트해 주세요',
        false,
        null,
        'mock-trace',
        426,
      );
    case 'fail':
      throw new ApiError(ERROR_CODES.NETWORK_ERROR, '네트워크 연결을 확인해주세요', true, null, null, null);
    case 'recommend':
      return { latest_version: '9.9.9', min_supported_version: '1.0.0', update_available: true };
    default:
      return { latest_version: '1.1.0', min_supported_version: '1.0.0', update_available: false };
  }
};
