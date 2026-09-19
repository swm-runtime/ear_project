import { useEffect, useState } from 'react';
import { Share } from 'react-native';

import { getPushToken } from '@/features/notification';

import SettingsRow from './SettingsRow';

/**
 * **개발계 앱 전용** — 이 기기의 Expo 푸시 토큰을 보여 준다(운영 앱에는 행 자체가 없다).
 *
 * 푸시는 실기기에서만 확인되는데, 테스트 발송(expo.dev/notifications)에는 토큰이 필요하다.
 * 토큰을 볼 곳이 없으면 매번 서버 DB 를 조회해 달라고 해야 한다. 값이 `없음`이면 알림 권한이
 * 없거나 발급이 실패한 것이다 — Android 는 FCM 설정이 빠진 빌드에서 조용히 `null`이 된다(KAN-81).
 * 탭하면 공유 시트로 내보낸다(클립보드 모듈은 네이티브라 OTA 로 못 넣는다).
 * 사용자 노출 문구가 아니라 개발 도구라 copy 파일에 두지 않는다.
 */
export default function DevPushTokenRow() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let isActive = true;
    void getPushToken().then((value) => {
      if (isActive) setToken(value);
    });
    return () => {
      isActive = false;
    };
  }, []);

  const value = token === undefined ? '조회 중' : (token ?? '없음');

  return (
    <SettingsRow
      label="푸시 토큰 (개발계)"
      value={token ? `${token.slice(0, 22)}…` : value}
      onPress={token ? () => void Share.share({ message: token }) : undefined}
      a11yLabel="푸시 토큰 공유"
    />
  );
}
