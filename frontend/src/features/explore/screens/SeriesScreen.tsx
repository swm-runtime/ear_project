import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import FullScreenError from '@/shared/ui/FullScreenError';
import GlassCapsule, { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import GlassIconButton from '@/shared/ui/GlassIconButton';
import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';
import MoreIcon from '@/shared/ui/MoreIcon';
import { Text } from '@/shared/ui/Typography';

import {
  DOCK_SCROLL_PROPS,
  PlayConfirmDialog,
  useBottomDockInset,
  usePlaybackStore,
} from '@/features/player';
import { IS_SHARE_ENABLED, SHARE_COPY, ShareIcon } from '@/features/share';

import ExploreMoreSheet from '../components/ExploreMoreSheet';
import SeriesEpisodeRow from '../components/SeriesEpisodeRow';
import SeriesHeader from '../components/SeriesHeader';
import SeriesMoreSheet from '../components/SeriesMoreSheet';
import SeriesSkeleton from '../components/SeriesSkeleton';
import { EXPLORE_COPY } from '../explore.copy';
import { toSeriesEpisodeState } from '../explore.series-episode';
import { useSeriesScreen } from '../hooks/useSeriesScreen';

/**
 * 시리즈 화면(E14 — explore.md 4.7 · explore-uiux.md 4.11). 탐색의 시리즈 카드(·상세의 시리즈 줄)가 연다. 화면은 뷰만 담당하고
 * 로직은 useSeriesScreen 이 소유한다. 탐색에서는 탭 안 스택에 푸시돼 독·미니플레이어가 남고(2026-10-22), 콘텐츠 상세의 시리즈 줄에서는 탭 위에 쌓인다.
 * 애플 뮤직 앨범 화면 문법(2026-10-22 PM): 앱바는 유리 원 뒤로만(가운데 제목 없음) / 머리(큰 표지·제목·`시리즈 · N편 · 상태`·소개)
 * / 구분선 / 번호 트랙 목록(episode_no 순 — 서버 정렬 그대로) / 끝 요약 `N편, 길이`. 다음 화 듣기·연속 재생은 없다(보류)
 */
export default function SeriesScreen() {
  const screen = useSeriesScreen();
  const nowPlayingContentId = usePlaybackStore((s) => s.session?.contentId ?? null);
  // 탐색 탭 안에서 열리면 독(탭 바 + 미니플레이어)이 목록 위에 떠 있다 — 그만큼 바닥을 비운다(탭 밖이면 미니플레이어 몫만)
  const dockInset = useBottomDockInset();
  /*
   * 앱바는 띠 없이 본문 위에 떠 있다(PM 2026-10-22 — 띠가 표지를 잘라 먹었다). 목록은 화면 맨 위부터 깔리고 첫 내용만
   * 앱바 높이만큼 내려 둔다. 시스템 탭 바(iOS 26)에선 스크롤 뷰가 상단 안전영역을 스스로 비우므로(DOCK_SCROLL_PROPS 의
   * automatic) 앱바 몫만 준다 — 탐색 화면과 같은 규칙
   */
  const insets = useSafeAreaInsets();
  const listTopInset = (HAS_NATIVE_TAB_BAR ? 0 : insets.top) + APP_BAR_HEIGHT;

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
            seriesTitle={series.title}
            isNowPlaying={episode.item.content.id === nowPlayingContentId}
            onPress={screen.handleEpisodePress}
            onMorePress={screen.openMoreSheet}
          />
        )}
        ItemSeparatorComponent={RowSeparator}
        ListHeaderComponent={
          <View>
            <SeriesHeader
              series={series}
              episodeCount={screen.episodeCount}
              playTarget={screen.playTarget}
              // 흐린 표지가 화면 꼭대기(상태바·떠 있는 앱바)까지 번지도록 목록 상단 여백만큼 위로 올린다.
              // 시스템 탭 바(iOS 26)에선 스크롤 뷰가 안전영역을 스스로 비우므로 여기에 안전영역을 더해야 꼭대기에 닿는다
              topBleed={insets.top + APP_BAR_HEIGHT}
              onPlay={screen.playSeries}
            />
            <View style={styles.headerRule} />
          </View>
        }
        ListFooterComponent={
          <Text style={styles.footer}>
            {EXPLORE_COPY.series.footer(screen.episodeCount, totalMinutes)}
          </Text>
        }
        {...DOCK_SCROLL_PROPS}
        contentContainerStyle={{
          paddingTop: listTopInset,
          paddingBottom: dockInset + theme.spacing.lg,
        }}
      />
    );
  };

  return (
    <View style={styles.container}>
      {/* 본문 — 목록은 화면 맨 위부터(앱바 밑으로 흘러간다). 스켈레톤·에러는 목록이 아니라 앱바 아래에서 시작한다 */}
      {screen.detail ? (
        renderBody()
      ) : (
        <View style={[styles.nonListBody, { paddingTop: insets.top + APP_BAR_HEIGHT }]}>
          {renderBody()}
        </View>
      )}

      {/* 앱바는 로딩보다 먼저 그린다 — 띠 없이 떠 있는 왼쪽 유리 원 뒤로 · 오른쪽 유리 캡슐(공유 · ⋯ — 애플 뮤직 앨범,
          PM 2026-10-22). 제목은 머리가 크게 말한다. 캡슐은 상세가 그려진 뒤에만 — 반쪽 값으로 공유하지 않는다(share-uiux.md 4.2).
          목록 위에 그리도록 본문 뒤에 둔다 */}
      <View style={[styles.appBar, { top: insets.top }]} pointerEvents="box-none">
        <GlassIconButton onPress={screen.goBack} accessibilityLabel={EXPLORE_COPY.series.backA11y}>
          <ChevronIcon direction="left" size={APP_BAR_ICON_SIZE} color={theme.color.textPrimary} />
        </GlassIconButton>
        {screen.detail ? (
          <GlassCapsule style={styles.actionCapsule}>
            {IS_SHARE_ENABLED && screen.canShareSeries ? (
              <Pressable
                style={styles.capsuleButton}
                onPress={screen.shareSeries}
                accessibilityRole="button"
                accessibilityLabel={SHARE_COPY.action}
              >
                <ShareIcon size={APP_BAR_ICON_SIZE} color={theme.color.textPrimary} />
              </Pressable>
            ) : null}
            <Pressable
              style={styles.capsuleButton}
              onPress={screen.openSeriesSheet}
              accessibilityRole="button"
              accessibilityLabel={EXPLORE_COPY.series.moreA11y}
            >
              <MoreIcon size={APP_BAR_ICON_SIZE + 2} color={theme.color.textPrimary} />
            </Pressable>
          </GlassCapsule>
        ) : null}
      </View>

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

      <SeriesMoreSheet
        series={screen.isSeriesSheetOpen && screen.detail ? screen.detail.series : null}
        onShare={screen.shareSeriesFromSheet}
        onDismiss={screen.closeSeriesSheet}
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
    </View>
  );
}

/** 편 행 사이 구분선 — 좌우 같은 여백(머리 아래 선과 같은 폭) */
const RowSeparator = () => <View style={styles.separator} />;

/** 앱바 유리 버튼 안 아이콘 — 콘텐츠 상세와 같은 값 */
const APP_BAR_ICON_SIZE = 20;
/** 떠 있는 앱바 줄 높이 — 유리 원(40) 터치 44 + 위아래 여유 */
const APP_BAR_HEIGHT = theme.touchTarget.minHeight + theme.spacing.sm;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  // 띠 없는 앱바 — 배경 없이 본문 위에 떠 있다. 버튼 사이 빈 곳의 터치는 밑 목록으로 흘린다(box-none)
  appBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    height: APP_BAR_HEIGHT,
  },
  nonListBody: {
    flex: 1,
  },
  // 오른쪽 캡슐 — 뒤로 원과 같은 높이(40), 아이콘 칸 둘
  actionCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_CONTROL_HEIGHT,
    paddingHorizontal: theme.spacing.xs,
  },
  capsuleButton: {
    width: HEADER_CONTROL_HEIGHT + theme.spacing.xs,
    height: HEADER_CONTROL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
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
  // 편 사이 구분선 — 머리 아래 선과 같이 좌우 같은 여백으로 가운데(PM 2026-10-22, 종전 제목 시작선 ~ 오른쪽 끝)
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: theme.spacing.md,
    backgroundColor: theme.color.border,
  },
});
