import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import FullScreenError from '@/shared/ui/FullScreenError';

import { useNoticeListScreen } from '../hooks/useNoticeListScreen';
import { NOTICE_SKELETON_ROW_COUNT } from '../notice.constants';
import { NOTICE_COPY } from '../notice.copy';
import { formatNoticeDate } from '../notice.format';
import type { NoticeSummary } from '../notice.types';

interface NoticeRowProps {
  notice: NoticeSummary;
  onPress: (noticeId: string) => void;
}

/** S8 목록 행 — 행 전체가 탭 대상(44pt 이상). 고정 공지는 "중요" 배지(색 + 텍스트) */
function NoticeRow({ notice, onPress }: NoticeRowProps) {
  const date = formatNoticeDate(notice.publishedAt);
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
      onPress={() => onPress(notice.id)}
      accessibilityRole="button"
      accessibilityLabel={NOTICE_COPY.rowA11y(notice.title, date, notice.isPinned)}
    >
      <View style={styles.rowTitleLine}>
        {notice.isPinned ? (
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>{NOTICE_COPY.pinnedBadge}</Text>
          </View>
        ) : null}
        <Text style={styles.rowTitle} numberOfLines={2}>
          {notice.title}
        </Text>
      </View>
      <Text style={styles.rowDate}>{date}</Text>
    </Pressable>
  );
}

/** 첫 로딩 스켈레톤 행 3개 — 0.3초 미만이면 부모가 표시하지 않는다(S8) */
function NoticeRowSkeleton() {
  return (
    <View accessibilityLabel={NOTICE_COPY.loadingA11y}>
      {Array.from({ length: NOTICE_SKELETON_ROW_COUNT }, (_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonDate} />
        </View>
      ))}
    </View>
  );
}

/** 공지 목록(S8·S10·S11) — 화면은 뷰만 담당하고 로직은 useNoticeListScreen이 소유한다 */
export default function NoticeListScreen() {
  const screen = useNoticeListScreen();

  const renderFooter = () => {
    if (screen.isFetchingNextPage) {
      return <ActivityIndicator style={styles.footer} color={theme.color.primary} />;
    }
    // 다음 페이지 실패 — 목록은 유지하고 끝에서 인라인 재시도(common-error-handling.md 4.3)
    if (screen.isLoadMoreFailed) {
      return (
        <View style={styles.footer}>
          <Text style={styles.footerText}>{NOTICE_COPY.loadError}</Text>
          <Pressable
            onPress={screen.retryLoadMore}
            accessibilityRole="button"
            accessibilityLabel={NOTICE_COPY.retry}
            style={styles.footerRetry}
          >
            <Text style={styles.footerRetryLabel}>{NOTICE_COPY.retry}</Text>
          </Pressable>
        </View>
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 앱바 — 뒤로가기 + "공지사항"(설정과 같은 앱바 문법 — settings-uiux.md 4.7 S8) */}
      <View style={styles.appBar}>
        <Pressable
          style={styles.backButton}
          onPress={screen.goBack}
          accessibilityRole="button"
          accessibilityLabel={NOTICE_COPY.backA11y}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appBarTitle} accessibilityRole="header">
          {NOTICE_COPY.title}
        </Text>
        <View style={styles.appBarSpacer} />
      </View>

      {screen.isFullError ? (
        <FullScreenError
          title={NOTICE_COPY.loadError}
          retryLabel={NOTICE_COPY.retry}
          isRetrying={screen.isRetrying}
          onRetry={screen.retry}
        />
      ) : screen.showSkeleton ? (
        <NoticeRowSkeleton />
      ) : screen.isInitialLoading ? (
        <View style={styles.container} />
      ) : (
        <FlatList
          data={screen.items}
          keyExtractor={(notice) => notice.id}
          renderItem={({ item }) => <NoticeRow notice={item} onPress={screen.openNotice} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            // S10 — 발행 공지 0건. 안내 문구만 두고 다음 행동 버튼은 두지 않는다
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{NOTICE_COPY.empty}</Text>
            </View>
          }
          ListFooterComponent={renderFooter()}
          contentContainerStyle={screen.isEmpty ? styles.emptyContent : undefined}
          refreshControl={
            <RefreshControl
              refreshing={screen.isManualRefreshing}
              onRefresh={() => void screen.refresh()}
              tintColor={theme.color.primary}
            />
          }
          onEndReached={screen.loadMore}
          onEndReachedThreshold={0.4}
        />
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
  appBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  appBarSpacer: {
    minWidth: theme.touchTarget.minWidth,
  },
  row: {
    minHeight: theme.touchTarget.minHeight,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.xs,
    justifyContent: 'center',
  },
  rowPressed: {
    backgroundColor: theme.color.surface,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  rowTitle: {
    flex: 1,
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  rowDate: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  // "중요" 배지 — 색 + 텍스트. warning은 "아직 하지 않은 일"이 아니라 강조용으로 쓴다(임시 토큰)
  badge: {
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
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: theme.spacing.md,
    backgroundColor: theme.color.border,
  },
  // 실제 행과 같은 높이·여백이어야 로딩이 끝날 때 목록이 튀지 않는다
  skeletonRow: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  skeletonTitle: {
    height: 16,
    width: '80%',
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
  },
  skeletonDate: {
    height: 12,
    width: '30%',
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
  },
  emptyContent: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  emptyText: {
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  footer: {
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  footerText: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  footerRetry: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  footerRetryLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
});
