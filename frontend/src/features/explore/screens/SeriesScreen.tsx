import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import FullScreenError from '@/shared/ui/FullScreenError';
import GlassIconButton from '@/shared/ui/GlassIconButton';
import { Text } from '@/shared/ui/Typography';

import { PlayConfirmDialog, usePlaybackStore } from '@/features/player';

import ExploreMoreSheet from '../components/ExploreMoreSheet';
import SeriesEpisodeRow, {
  SERIES_EPISODE_NUMBER_GAP,
  SERIES_EPISODE_NUMBER_WIDTH,
} from '../components/SeriesEpisodeRow';
import SeriesHeader from '../components/SeriesHeader';
import SeriesSkeleton from '../components/SeriesSkeleton';
import { EXPLORE_COPY } from '../explore.copy';
import { toSeriesEpisodeState } from '../explore.series-episode';
import { useSeriesScreen } from '../hooks/useSeriesScreen';

/**
 * 시리즈 화면(E14 — explore.md 4.7 · explore-uiux.md 4.11). 탐색의 시리즈 카드(·상세의 시리즈 줄)가 연다. 화면은 뷰만 담당하고
 * 로직은 useSeriesScreen 이 소유한다. 하단 탭 위에 쌓이는 푸시 화면이다.
 * 애플 뮤직 앨범 화면 문법(2026-10-22 PM): 앱바는 유리 원 뒤로만(가운데 제목 없음) / 머리(큰 표지·제목·`시리즈 · N편 · 상태`·소개)
 * / 구분선 / 번호 트랙 목록(episode_no 순 — 서버 정렬 그대로) / 끝 요약 `N편, 길이`. 다음 화 듣기·연속 재생은 없다(보류)
 */
export default function SeriesScreen() {
  const screen = useSeriesScreen();
  const nowPlayingContentId = usePlaybackStore((s) => s.session?.contentId ?? null);

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
    // 끝 요약 길이 — 편 행에 적힌 "N분"을 그대로 더한다(행 숫자의 합과 맞게)
    const totalMinutes = screen.episodes.reduce(
      (sum, episode) => sum + toSeriesEpisodeState(episode).minutes,
      0,
    );
    return (
      <FlatList
        data={screen.episodes}
        keyExtractor={(episode) => episode.item.content.id}
        renderItem={({ item: episode }) => (
          <SeriesEpisodeRow
            episode={episode}
            isNowPlaying={episode.item.content.id === nowPlayingContentId}
            onPress={screen.handleEpisodePress}
            onMorePress={screen.openMoreSheet}
          />
        )}
        ItemSeparatorComponent={RowSeparator}
        ListHeaderComponent={
          <View>
            <SeriesHeader series={series} episodeCount={screen.episodeCount} />
            <View style={styles.headerRule} />
          </View>
        }
        ListFooterComponent={
          <Text style={styles.footer}>
            {EXPLORE_COPY.series.footer(screen.episodeCount, totalMinutes)}
          </Text>
        }
        contentContainerStyle={styles.listContent}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 앱바는 로딩보다 먼저 그린다 — 유리 원 뒤로만. 제목은 머리가 크게 말한다(앨범 화면 문법) */}
      <View style={styles.appBar}>
        <GlassIconButton onPress={screen.goBack} accessibilityLabel={EXPLORE_COPY.series.backA11y}>
          <ChevronIcon direction="left" size={APP_BAR_ICON_SIZE} color={theme.color.textPrimary} />
        </GlassIconButton>
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

/** 편 행 사이 구분선 — 번호 칸 오른쪽(제목 시작선)부터 긋는다(앨범 트랙 목록 문법) */
const RowSeparator = () => <View style={styles.separator} />;

/** 앱바 유리 버튼 안 아이콘 — 콘텐츠 상세와 같은 값 */
const APP_BAR_ICON_SIZE = 20;
/** 구분선 시작 — 행 왼쪽 여백(16) + 번호 칸 + 간격 */
const SEPARATOR_INSET = theme.spacing.md + SERIES_EPISODE_NUMBER_WIDTH + SERIES_EPISODE_NUMBER_GAP;

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
  listContent: {
    paddingBottom: theme.spacing.xxl,
  },
  // 머리와 목록 사이 한 줄 — 좌우 여백 안쪽(앨범 화면의 버튼 줄 아래 선 자리)
  headerRule: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: theme.spacing.md,
    backgroundColor: theme.color.border,
  },
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: SEPARATOR_INSET,
    backgroundColor: theme.color.border,
  },
});
