import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import FullScreenError from '@/shared/ui/FullScreenError';

import { useNoticeDetailScreen } from '../hooks/useNoticeDetailScreen';
import { NOTICE_BODY_LINE_HEIGHT_RATIO } from '../notice.constants';
import { NOTICE_COPY } from '../notice.copy';
import { formatNoticeDate } from '../notice.format';

/** 본문 스켈레톤 줄 수 — 실제 본문의 첫 문단 정도의 높이를 잡아 둔다 */
const BODY_SKELETON_LINE_COUNT = 4;

/** 본문 자리 스켈레톤 — 제목·날짜는 목록 값으로 즉시 그리고 본문만 기다린다(S9) */
function NoticeBodySkeleton() {
  return (
    <View style={styles.bodySkeleton} accessibilityLabel={NOTICE_COPY.loadingA11y}>
      {Array.from({ length: BODY_SKELETON_LINE_COUNT }, (_, index) => (
        <View
          key={index}
          style={[
            styles.bodySkeletonLine,
            index === BODY_SKELETON_LINE_COUNT - 1 ? styles.bodySkeletonLineShort : null,
          ]}
        />
      ))}
    </View>
  );
}

/**
 * 공지 상세(S9·S11) — 화면은 뷰만 담당하고 로직은 useNoticeDetailScreen이 소유한다.
 * 앱바에 타이틀을 두지 않는다 — 제목은 본문에 크게 한 번만(settings-uiux.md 4.7 S9).
 */
export default function NoticeDetailScreen() {
  const screen = useNoticeDetailScreen();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 앱바 — 뒤로가기만. 타이틀 없음(S9) */}
      <View style={styles.appBar}>
        <Pressable
          style={styles.backButton}
          onPress={screen.goBack}
          accessibilityRole="button"
          accessibilityLabel={NOTICE_COPY.backA11y}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
      </View>

      {screen.isFullError ? (
        <FullScreenError
          title={NOTICE_COPY.loadError}
          retryLabel={NOTICE_COPY.retry}
          isRetrying={screen.isRetrying}
          onRetry={screen.retry}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {screen.header !== null ? (
            <>
              {screen.header.isPinned ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeLabel}>{NOTICE_COPY.pinnedBadge}</Text>
                </View>
              ) : null}
              <Text style={styles.title} accessibilityRole="header">
                {screen.header.title}
              </Text>
              <Text style={styles.date}>{formatNoticeDate(screen.header.publishedAt)}</Text>
            </>
          ) : screen.showBodySkeleton ? (
            // 목록을 거치지 않은 진입 — 헤더 요약이 없으면 제목·날짜 자리도 스켈레톤이다
            <View style={styles.headerSkeleton} accessibilityLabel={NOTICE_COPY.loadingA11y}>
              <View style={styles.headerSkeletonTitle} />
              <View style={styles.headerSkeletonDate} />
            </View>
          ) : null}

          <View style={styles.divider} />

          {screen.body !== null ? (
            // 줄바꿈 보존 일반 텍스트 — 마크다운·링크 자동 인식 없음. 텍스트 선택 가능(S9)
            <Text style={styles.body} selectable>
              {screen.body}
            </Text>
          ) : screen.showBodySkeleton ? (
            <NoticeBodySkeleton />
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  backButton: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.warningSurface,
  },
  badgeLabel: {
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: theme.color.warning,
  },
  title: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  date: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.color.border,
    marginVertical: theme.spacing.sm,
  },
  body: {
    fontSize: theme.font.size.md,
    lineHeight: theme.font.size.md * NOTICE_BODY_LINE_HEIGHT_RATIO,
    color: theme.color.textPrimary,
  },
  headerSkeleton: {
    gap: theme.spacing.sm,
  },
  headerSkeletonTitle: {
    height: 28,
    width: '85%',
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
  },
  headerSkeletonDate: {
    height: 14,
    width: '30%',
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
  },
  bodySkeleton: {
    gap: theme.spacing.sm,
  },
  bodySkeletonLine: {
    height: 16,
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
    alignSelf: 'stretch',
  },
  bodySkeletonLineShort: {
    width: '60%',
    alignSelf: 'flex-start',
  },
});
