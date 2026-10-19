import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import FullScreenError from '@/shared/ui/FullScreenError';
import { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import GlassIconButton from '@/shared/ui/GlassIconButton';
import { Text } from '@/shared/ui/Typography';

import { PlayConfirmDialog } from '@/features/player';

import ExploreMoreSheet from '../components/ExploreMoreSheet';
import SeriesEpisodeRow, { SERIES_EPISODE_THUMBNAIL_SIZE } from '../components/SeriesEpisodeRow';
import SeriesHeader from '../components/SeriesHeader';
import SeriesSkeleton from '../components/SeriesSkeleton';
import { EXPLORE_COPY } from '../explore.copy';
import { useSeriesScreen } from '../hooks/useSeriesScreen';

/**
 * 시리즈 화면(E14 — explore.md 4.7 · explore-uiux.md 4.11). 탐색의 시리즈 카드(·상세의 시리즈 줄)가 연다. 화면은 뷰만 담당하고
 * 로직은 useSeriesScreen 이 소유한다. 하단 탭 위에 쌓이는 푸시 화면이고 앱바는 콘텐츠 상세와 같은 문법(유리 원 뒤로 + 가운데 제목)이다.
 * 구성: 머리(표지·제목·편수·상태·소개) / 편 목록(episode_no 순 — 서버 정렬 그대로). 다음 화 듣기·연속 재생은 없다(보류)
 */
export default function SeriesScreen() {
  const screen = useSeriesScreen();

  const renderBody = () => {
    if (screen.isInitialLoading) {
      return screen.showSkeleton ? <SeriesSkeleton /> : null;
    }
    // 404 — 없는·다른 시장·노출 편 0개 시리즈(explore-api.md 4.7). 다시 시도해도 같으므로 [다시 시도] 대신 [돌아가기]
    if (screen.isNotFound) {
      return (
        <FullScreenError
          title={EXPLORE_COPY.series.notFound.title}
          retryLabel={EXPLORE_COPY.series.notFound.action}
          onRetry={screen.goBack}
        />
      );
    }
    if (screen.isFullError) {
      return (
        <FullScreenError
          title={
            screen.isFullErrorNetwork
              ? EXPLORE_COPY.error.networkTitle
              : EXPLORE_COPY.error.loadFailedTitle
          }
          description={EXPLORE_COPY.error.loadFailedDescription}
          retryLabel={EXPLORE_COPY.error.retry}
          isRetrying={screen.isRetrying}
          onRetry={screen.retry}
        />
      );
    }
    if (!screen.detail) return null;

    const { series } = screen.detail;
    return (
      <FlatList
        data={screen.episodes}
        keyExtractor={(episode) => episode.item.content.id}
        renderItem={({ item: episode }) => (
          <SeriesEpisodeRow
            episode={episode}
            onPress={screen.handleEpisodePress}
            onMorePress={screen.openMoreSheet}
          />
        )}
        ItemSeparatorComponent={RowSeparator}
        ListHeaderComponent={
          <View>
            <SeriesHeader series={series} episodeCount={screen.episodeCount} />
            <Text style={styles.sectionLabel} accessibilityRole="header">
              {EXPLORE_COPY.series.episodesTitle}
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 앱바는 로딩보다 먼저 그린다 — 콘텐츠 상세(CD)와 같은 유리 원 뒤로 + 가운데 제목 */}
      <View style={styles.appBar}>
        <GlassIconButton onPress={screen.goBack} accessibilityLabel={EXPLORE_COPY.series.backA11y}>
          <ChevronIcon direction="left" size={APP_BAR_ICON_SIZE} color={theme.color.textPrimary} />
        </GlassIconButton>
        <Text style={styles.appBarTitle} accessibilityRole="header">
          {EXPLORE_COPY.series.appBarTitle}
        </Text>
        <View style={styles.appBarSpacer} />
      </View>

      {renderBody()}

      <ExploreMoreSheet
        item={screen.moreSheetItem}
        onDetail={screen.openDetail}
        onSourceLink={screen.openSourceLink}
        onSave={screen.requestSave}
        onRemove={screen.requestRemove}
        onShare={screen.shareItem}
        onDismiss={screen.closeMoreSheet}
        onDismissed={screen.handleSheetDismiss}
      />

      {/* 재생 확인 팝업 — 탐색·라이브러리와 완전히 같다(paywall.md 4.2). 이 화면은 여는 지점만 소유한다 */}
      <PlayConfirmDialog
        visible={screen.playConfirm !== null}
        remaining={screen.playConfirm?.remaining ?? 0}
        onConfirm={screen.confirmPlay}
        onCancel={screen.cancelPlayConfirm}
        onSuppressToday={screen.suppressAndPlay}
      />
    </SafeAreaView>
  );
}

/** 편 행 사이 구분선 — 썸네일 오른쪽(글자 시작선)부터 긋는다(iOS 목록 문법) */
const RowSeparator = () => <View style={styles.separator} />;

/** 앱바 유리 버튼 안 아이콘 — 콘텐츠 상세와 같은 값 */
const APP_BAR_ICON_SIZE = 20;
/** 구분선 시작 — 행 왼쪽 여백(16) + 썸네일(64) + 간격(16) */
const SEPARATOR_INSET = theme.spacing.md + SERIES_EPISODE_THUMBNAIL_SIZE + theme.spacing.md;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  appBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  // 제목이 가운데에 서게 뒤로 버튼과 같은 폭을 비운다
  appBarSpacer: {
    width: HEADER_CONTROL_HEIGHT,
  },
  listContent: {
    paddingBottom: theme.spacing.xxl,
  },
  sectionLabel: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: SEPARATOR_INSET,
    backgroundColor: theme.color.border,
  },
});
