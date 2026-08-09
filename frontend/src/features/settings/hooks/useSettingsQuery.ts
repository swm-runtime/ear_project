import { useQuery } from '@tanstack/react-query';

import { APP_VERSION } from '@/shared/lib/app-version';

import { fetchSettingsSummary, settingsKeys } from '../api/settings.api';

/**
 * 설정 화면 조회(settings-api.md 4.1). 진입(마운트)마다 조회한다 —
 * 다른 기기에서 바꾼 구독 상태를 재동기화한다(settings.md 7장).
 */
export const useSettingsQuery = () =>
  useQuery({
    queryKey: settingsKeys.summary(),
    queryFn: () => fetchSettingsSummary({ appVersion: APP_VERSION }),
  });
