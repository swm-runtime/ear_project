import { useState } from 'react';

import { getLastAnalyticsEvent } from '@/shared/analytics';

import SettingsRow from './SettingsRow';

/**
 * **개발계 앱 전용** 진단 행 두 개(운영 앱에는 행 자체가 없다) — 푸시 토큰 행과 같은 방식.
 *
 * - **분석 디버그** — 마지막으로 보낸 GA4 이벤트 이름. DebugView 에 안 보일 때 "앱이 안 보낸 것"인지
 *   "Firebase 가 안 받은 것"인지 가른다(analytics.md 5장, KAN-90).
 * - **크래시 테스트** — 탭하면 렌더 중 예외를 던진다. 전역 ErrorBoundary 가 복구 화면을 띄우고
 *   Sentry 에 이슈가 올라가는지 실기기에서 확인하는 유일한 수단이다(KAN-92 완료 조건 1·2).
 *   버튼은 누르는 순간 이 행 자체가 던지므로, 화면 전체가 복구 화면으로 바뀐다.
 * 사용자 노출 문구가 아니라 개발 도구라 copy 파일에 두지 않는다.
 */
export default function DevDiagnosticsRows() {
  const [shouldCrash, setShouldCrash] = useState(false);
  const [lastEvent, setLastEvent] = useState<string | null>(getLastAnalyticsEvent());

  if (shouldCrash) {
    throw new Error('[dev] crash test — 설정 > 크래시 테스트에서 의도적으로 던진 오류');
  }

  return (
    <>
      <SettingsRow
        label="분석 디버그 (개발계)"
        value={lastEvent ?? '아직 없음'}
        onPress={() => setLastEvent(getLastAnalyticsEvent())}
        a11yLabel="마지막 분석 이벤트 새로고침"
      />
      <SettingsRow
        label="크래시 테스트 (개발계)"
        value="탭하면 앱이 복구 화면으로"
        onPress={() => setShouldCrash(true)}
        a11yLabel="크래시 테스트"
        isSubdued
      />
    </>
  );
}
