import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getAnalyticsDebugLog, type AnalyticsDebugEntry } from '@/shared/analytics';
import {
  cycleScrollEdgeEffectStyle,
  getLastScrollEdgeEffectAttempt,
} from '@/shared/navigation/useSystemScrollEdgeEffect';
import {
  getLastPlayerZoomArmResult,
  getPlayerMountCount,
  getPlayerZoomNativeDiagnostics,
} from '@/shared/navigation/zoom-transition';
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
  const [edgeEffect, setEdgeEffect] = useState(getLastScrollEdgeEffectAttempt);
  // 줌 전환 진단(2026-09-26 20:28) — 드래그로 닫은 뒤 탭을 바꾸면 플레이어가 번쩍인다. 이 화면(설정)이 속한 스택의
  // 라우트에 Player 가 남아 있으면 "JS 가 pop 을 못 받은 것", 없으면 RNS 네이티브 쪽 문제다
  const navigation = useNavigation();
  const stackRoutes = navigation
    .getState()
    ?.routes.map((r) => r.name)
    .join(' › ');

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
      {/* 상태 바 밑 시스템 블러(scroll edge effect) 적용 결과 — applied:… 만 성공.
          탭하면 soft → hard → hidden 으로 바꿔 즉시 다시 건다(hard 는 뿌연 띠 + 선이라 효과 영역이 있으면 확실히 보인다) */}
      <SettingsRow
        label="상단 블러 (개발계)"
        value={edgeEffect}
        onPress={() => void cycleScrollEdgeEffectStyle().then(setEdgeEffect)}
        a11yLabel="상단 블러 스타일 바꾸기"
      />
      <SettingsRow
        label="스택 라우트 (개발계)"
        value={`${stackRoutes ?? '?'} · 줌 ${getLastPlayerZoomArmResult()} · 플레이어 마운트 ${getPlayerMountCount()}회 · 네이티브 ${getPlayerZoomNativeDiagnostics()}`}
        a11yLabel="내비게이션 스택 라우트"
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
