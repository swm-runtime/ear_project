import { FlatList, Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme, useActiveScheme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import FullScreenError from '@/shared/ui/FullScreenError';
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
  const isPlayerPlaying = usePlaybackStore((s) => s.session?.isPlaying ?? false);
  // 탐색 탭 안에서 열리면 독(탭 바 + 미니플레이어)이 목록 위에 떠 있다 — 그만큼 바닥을 비운다(탭 밖이면 미니플레이어 몫만)
  const dockInset = useBottomDockInset();
  /*
   * 앱바는 띠 없이 본문 위에 떠 있다(PM 2026-10-22 — 띠가 표지를 잘라 먹었다). 목록은 화면 맨 위부터 깔리고 첫 내용만
   * 앱바 높이만큼 내려 둔다. 시스템 탭 바(iOS 26)에선 스크롤 뷰가 상단 안전영역을 스스로 비우므로(DOCK_SCROLL_PROPS 의
   * automatic) 앱바 몫만 준다 — 탐색 화면과 같은 규칙
   */
  const insets = useSafeAreaInsets();
  const listTopInset = (HAS_NATIVE_TAB_BAR ? 0 : insets.top) + APP_BAR_HEIGHT;
  /*
   * 바탕은 **플레이어와 같다**(PM 2026-10-22 08:32 "플레이어 열 때처럼") — 표지를 크게 흐려(60) 화면 전체에 고정으로 깔고 막 한 겹(다크
   * 차콜 72%). 표지 색이 바탕에 배어 검정 솔리드보다 덜 답답하다. 머리의 흐림·페이드·단색 추출은 걷었다. 라이트 모드는 글자가 모드
   * 기본색(검정)이라 흰 막을 같은 세기로 얹는다
   */
  const scheme = useActiveScheme();
  const backdropUri = screen.detail?.series.thumbnailUrl ?? null;

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
            isPlaying={isPlayerPlaying}
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
              onPlay={screen.playSeries}
              onShuffle={screen.shuffleSeries}
              onSaveSeries={screen.saveSeries}
              onRemoveSeries={screen.removeSeries}
              isSeriesSaved={screen.isSeriesSaved}
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
      {/* 흐린 표지 바탕 — 플레이어와 같은 흐림·막(PlayerScreen backdrop). 스크롤과 무관하게 화면에 고정, 본문 뒤 */}
      {backdropUri ? (
        <View style={styles.backdrop} pointerEvents="none">
          <Image
            source={{ uri: backdropUri }}
            style={styles.backdropImage}
            // 플레이어와 같은 기본 Image 흐림(KAN-78 — expo-image 는 세기 기준이 달라 톤이 바뀐다. Android RenderScript 도 피한다)
            blurRadius={BACKDROP_BLUR_RADIUS}
            resizeMode="cover"
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <View
            style={[
              styles.backdropScrim,
              { backgroundColor: scheme === 'dark' ? BACKDROP_SCRIM_DARK : BACKDROP_SCRIM_LIGHT },
            ]}
          />
        </View>
      ) : null}
      {/* 본문 — 목록은 화면 맨 위부터(앱바 밑으로 흘러간다). 스켈레톤·에러는 목록이 아니라 앱바 아래에서 시작한다 */}
      {screen.detail ? (
        renderBody()
      ) : (
        <View style={[styles.nonListBody, { paddingTop: insets.top + APP_BAR_HEIGHT }]}>
          {renderBody()}
        </View>
      )}

      {/* 앱바는 로딩보다 먼저 그린다 — 띠 없이 떠 있는 왼쪽 유리 원 뒤로 · 오른쪽 유리 원 ⋯(애플 뮤직 앨범, PM 2026-10-22.
          공유 아이콘은 뺐다 — 공유는 ⋯ 시트 안). 제목은 머리가 크게 말한다. ⋯ 는 상세가 그려진 뒤에만 — 반쪽 값으로
          공유하지 않는다(share-uiux.md 4.2). 목록 위에 그리도록 본문 뒤에 둔다 */}
      <View style={[styles.appBar, { top: insets.top }]} pointerEvents="box-none">
        <GlassIconButton
          onPress={screen.goBack}
          accessibilityLabel={EXPLORE_COPY.series.backA11y}
          style={styles.barButton}
        >
          <ChevronIcon direction="left" size={APP_BAR_ICON_SIZE} color={theme.color.textPrimary} />
        </GlassIconButton>
        {screen.detail ? (
          <GlassIconButton
            onPress={screen.openSeriesSheet}
            accessibilityLabel={EXPLORE_COPY.series.moreA11y}
            style={styles.barButton}
          >
            <MoreIcon size={APP_BAR_ICON_SIZE + 2} color={theme.color.textPrimary} />
          </GlassIconButton>
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

/**
 * 떠 있는 앱바 버튼 — 다른 화면의 머리 줄 컨트롤(40)보다 크게(PM 2026-10-22 "상단 버튼 키우자"). 큰 표지 위에 떠서
 * 애플 뮤직 앨범 화면처럼 손에 잘 걸리는 크기. 뒤로 원·⋯ 원이 같은 크기
 */
const BAR_BUTTON_SIZE = 48;
/** 흐린 표지 바탕 — 플레이어(PlayerScreen)와 같은 값. 바꾸면 둘을 같이 바꾼다 */
const BACKDROP_BLUR_RADIUS = 60;
const BACKDROP_SCRIM_DARK = 'rgba(23, 23, 26, 0.72)';
const BACKDROP_SCRIM_LIGHT = 'rgba(255, 255, 255, 0.72)';
const APP_BAR_ICON_SIZE = 24;
/** 떠 있는 앱바 줄 높이 — 유리 원 + 위아래 여유 */
const APP_BAR_HEIGHT = BAR_BUTTON_SIZE + theme.spacing.sm;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  // 흐린 표지 바탕 — 화면을 꽉 채우고 가장자리 투명해짐을 화면 밖으로 밀어낸다(플레이어와 같이 1.25 배, 잘라냄)
  backdrop: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  backdropImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.25 }],
  },
  backdropScrim: {
    ...StyleSheet.absoluteFill,
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
  barButton: {
    width: BAR_BUTTON_SIZE,
    height: BAR_BUTTON_SIZE,
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
