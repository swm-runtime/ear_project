import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getAnalyticsDebugLog, type AnalyticsDebugEntry } from '@/shared/analytics';
import { theme } from '@/shared/theme';

import SettingsRow from './SettingsRow';

/**
 * **개발계 앱 전용** 진단 행(운영 앱에는 행 자체가 없다) — 푸시 토큰 행과 같은 방식.
 *
 * - **분석 디버그** — 최근 GA4 발송 10건과 **결과**(sent·failed·stubbed). 마지막 1개만 보이면 재생 뒤
 *   화면 이동이 덮어 버려 진단이 안 됐다(2026-09-24). DebugView 에 안 보일 때 "앱이 안 보낸 것"인지
 *   "SDK 가 거부한 것"인지 "Firebase 가 아직 안 올린 것"인지 가른다(analytics.md 5장, KAN-90).
 * - **크래시 테스트** — 탭하면 렌더 중 예외를 던진다. 전역 ErrorBoundary 가 복구 화면을 띄우고
 *   Sentry 에 이슈가 올라가는지 실기기에서 확인하는 유일한 수단이다(KAN-92 완료 조건 1·2).
 *   버튼은 누르는 순간 이 행 자체가 던지므로, 화면 전체가 복구 화면으로 바뀐다.
 * 사용자 노출 문구가 아니라 개발 도구라 copy 파일에 두지 않는다.
 */
export default function DevDiagnosticsRows() {
  const [shouldCrash, setShouldCrash] = useState(false);
  const [log, setLog] = useState<AnalyticsDebugEntry[]>(getAnalyticsDebugLog);

  if (shouldCrash) {
    throw new Error('[dev] crash test — 설정 > 크래시 테스트에서 의도적으로 던진 오류');
  }

  const failedCount = log.filter((e) => e.status === 'failed').length;

  return (
    <>
      <SettingsRow
        label="분석 디버그 (개발계)"
        value={log.length === 0 ? '아직 없음' : `${log.length}건${failedCount ? ` · 실패 ${failedCount}` : ''}`}
        onPress={() => setLog(getAnalyticsDebugLog())}
        a11yLabel="최근 분석 이벤트 새로고침"
      />
      {log.length > 0 ? (
        <View style={styles.log} accessibilityLabel="최근 분석 이벤트 목록">
          {log.map((entry) => (
            <Text key={`${entry.at}-${entry.label}`} style={styles.line} numberOfLines={2}>
              <Text style={entry.status === 'failed' ? styles.failed : styles.status}>
                {STATUS_MARK[entry.status]}
              </Text>
              {` ${formatTime(entry.at)} ${entry.label}`}
              {entry.reason ? ` — ${entry.reason}` : ''}
            </Text>
          ))}
        </View>
      ) : null}
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

const STATUS_MARK: Record<AnalyticsDebugEntry['status'], string> = {
  sending: '…',
  sent: '✓',
  stubbed: '–',
  failed: '✕',
};

const formatTime = (at: number): string => {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

const styles = StyleSheet.create({
  log: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  line: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  status: {
    color: theme.color.textSecondary,
  },
  failed: {
    color: theme.color.danger,
    fontWeight: '700',
  },
});
