import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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
import SeriesHeader, { seriesCoverSize } from '../components/SeriesHeader';
import SeriesMoreSection from '../components/SeriesMoreSection';
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
  /*
   * 맨 위에서 더 당긴 거리(pt) — 표지·흐린 바탕이 손을 따라 늘어났다가 놓으면 목록 튕김과 같이 돌아온다(애플 뮤직 앨범,
   * PM 2026-10-22 "맨 위로 올리고 초과됐을 때 다시 돌아오는 애니메이션"). 스크롤 위치에 묶여 UI 스레드에서 움직이므로 따로
   * 되돌리는 애니메이션이 없다. 쉬는 위치는 시스템 탭 바(automatic)면 상단 안전영역만큼 음수, 아니면 0.
   * Android 는 맨 위를 넘겨 당겨지지 않아(음수 오프셋 없음) 그대로다
   */
  const restingOffset = HAS_NATIVE_TAB_BAR ? -insets.top : 0;
  const overscroll = useSharedValue(0);
  /*
   * 손가락이 붙어 있는 동안만 스크롤 위치를 그대로 따른다. 놓는 순간부터는 위치 신호를 버리고 직접 부드럽게 줄인다 — 튕겨
   * 돌아가는 동안 스크롤 신호가 드문드문 와서 표지가 계단처럼 툭 줄어들었다(PM 2026-10-22 15:18 "돌아올 때 급격해 끊어져 보여")
   */
  const isDragging = useSharedValue(false);
  /** 쉬는 위치 기준 스크롤 거리 — 위로 올리면 양수, 맨 위에서 당기면 음수. 표지 뒤 비침 영역이 머리를 따라 움직이는 데 쓴다 */
  const scrollFromRest = useSharedValue(0);
  const handleScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      isDragging.value = true;
      cancelAnimation(overscroll);
    },
    onScroll: (event) => {
      scrollFromRest.value = event.contentOffset.y - restingOffset;
      if (isDragging.value) overscroll.value = Math.max(0, restingOffset - event.contentOffset.y);
    },
    onEndDrag: () => {
      isDragging.value = false;
      if (overscroll.value > 0) {
        overscroll.value = withTiming(0, {
          duration: OVERSCROLL_RELEASE_MS,
          easing: Easing.out(Easing.cubic),
        });
      }
    },
  });
  const backdropStretchStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + overscroll.value / BACKDROP_STRETCH_DISTANCE }],
  }));

  /*
   * 표지 뒤 비침(PM 2026-10-22 15:37 "앨범커버 뒤에 배경을 앨범커버 blur 로 비치게, 그 아래는 기존처럼") — 같은 흐린 표지 위에 막을
   * 두 겹으로 나눈다. 화면 전체에 옅은 막(위쪽 — 표지 색이 비친다), 그 위로 표지 아랫부분부터 아래로 진한 막(페이드 후 솔리드).
   * 두 겹이 겹친 아래쪽은 종전 바탕(막 72%)과 같은 세기라 편 목록 바탕은 그대로다. 진한 막의 윗변은 머리(표지 아랫변)를 따라
   * 스크롤·당김과 함께 움직이고, 화면 위로 다 올라가면 거기서 멈춘다(화면 전체가 종전 바탕)
   */
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const coverBottomAtRest =
    insets.top + APP_BAR_HEIGHT + theme.spacing.md + seriesCoverSize(windowWidth);
  const scrimEdgeAtRest = coverBottomAtRest - COVER_GLOW_FADE_LEAD;
  const lowerScrimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(-COVER_GLOW_FADE, scrimEdgeAtRest - scrollFromRest.value) }],
  }));
  const scrimRgb = scheme === 'dark' ? BACKDROP_SCRIM_DARK_RGB : BACKDROP_SCRIM_LIGHT_RGB;

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
      <Animated.FlatList
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
              overscroll={overscroll}
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
          <View>
            <Text style={styles.footer}>
              {EXPLORE_COPY.series.footer(screen.episodeCount, totalMinutes)}
            </Text>
            {/* 애플 뮤직 앨범 화면 아래 두 줄(PM 2026-10-22) — 비면 줄째 숨는다 */}
            <SeriesMoreSection
              title={EXPLORE_COPY.series.moreSeriesTitle}
              entries={screen.otherSeries}
              onPress={screen.playRelated}
              onMorePress={screen.openMoreSheet}
              onSeriesPress={screen.openOtherSeries}
            />
            <SeriesMoreSection
              title={EXPLORE_COPY.series.youMayLikeTitle}
              entries={screen.relatedItems}
              onPress={screen.playRelated}
              onMorePress={screen.openMoreSheet}
              onSeriesPress={screen.openOtherSeries}
            />
          </View>
        }
        {...DOCK_SCROLL_PROPS}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: listTopInset,
          paddingBottom: dockInset + theme.spacing.lg,
        }}
      />
    );
  };

  return (
    <View style={styles.container}>
      {/* 흐린 표지 바탕 — 플레이어와 같은 흐림·막(PlayerScreen backdrop). 스크롤과 무관하게 화면에 고정, 본문 뒤. 맨 위에서 더 당길 때만 커진다 */}
      {backdropUri ? (
        <Animated.View style={[styles.backdrop, backdropStretchStyle]} pointerEvents="none">
          <Image
            source={{ uri: backdropUri }}
            style={styles.backdropImage}
            // 플레이어와 같은 기본 Image 흐림(KAN-78 — expo-image 는 세기 기준이 달라 톤이 바뀐다. Android RenderScript 도 피한다)
            blurRadius={BACKDROP_BLUR_RADIUS}
            resizeMode="cover"
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Animated.View>
      ) : null}
      {/* 막 두 겹 — 위쪽 옅은 막(표지 뒤 비침) + 표지 아래부터 진한 막. 당김 확대(scale)와 무관하게 화면 좌표에 둔다 */}
      {backdropUri ? (
        <>
          <View
            style={[
              styles.backdropScrim,
              { backgroundColor: rgba(scrimRgb, COVER_GLOW_SCRIM_ALPHA) },
            ]}
            pointerEvents="none"
          />
          <Animated.View
            style={[
              styles.lowerScrim,
              { height: windowHeight + COVER_GLOW_FADE * 2 },
              lowerScrimStyle,
            ]}
            pointerEvents="none"
          >
            <LinearGradient
              colors={[rgba(scrimRgb, 0), rgba(scrimRgb, LOWER_SCRIM_ALPHA)]}
              style={styles.lowerScrimFade}
            />
            <View
              style={[
                styles.lowerScrimSolid,
                { backgroundColor: rgba(scrimRgb, LOWER_SCRIM_ALPHA) },
              ]}
            />
          </Animated.View>
        </>
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

/** 흐린 바탕이 당긴 거리만큼 커지는 비율의 분모 — 800pt 당기면 2배(실제 당김은 고무줄이라 100~200pt, 1.1~1.25배) */
const BACKDROP_STRETCH_DISTANCE = 800;
/** 놓은 뒤 표지·바탕이 원래 크기로 돌아가는 시간 — iOS 목록 튕김(약 0.4~0.5초)에 맞춘다 */
const OVERSCROLL_RELEASE_MS = 450;

/**
 * 머리 아래 선·편 사이 구분선 두께 — 1pt(PM 2026-10-22 "리스트 구분선들도 잘 보이게"). 종전 머리카락 굵기(1px) +
 * `border`(#E3E3E8)는 흐린 표지 배경·회색 재생 중 행 옆에서 묻혔다. 색은 iOS separator(`theme.color.separator`)
 */
const LIST_RULE_THICKNESS = 1;

/**
 * 떠 있는 앱바 버튼 — 다른 화면의 머리 줄 컨트롤(40)보다 크게(PM 2026-10-22 "상단 버튼 키우자"). 큰 표지 위에 떠서
 * 애플 뮤직 앨범 화면처럼 손에 잘 걸리는 크기. 뒤로 원·⋯ 원이 같은 크기
 */
const BAR_BUTTON_SIZE = 48;
/** 흐린 표지 바탕 — 플레이어(PlayerScreen)와 같은 값. 바꾸면 둘을 같이 바꾼다 */
const BACKDROP_BLUR_RADIUS = 60;
/** 막 색(다크 차콜 · 라이트 흰색) — 편 목록 바탕의 최종 세기는 플레이어와 같은 72% */
const BACKDROP_SCRIM_DARK_RGB = '23, 23, 26';
const BACKDROP_SCRIM_LIGHT_RGB = '255, 255, 255';
const BACKDROP_SCRIM_ALPHA = 0.72;
/** 표지 뒤(위쪽) 막 세기 — 낮을수록 흐린 표지 색이 또렷이 비친다 */
const COVER_GLOW_SCRIM_ALPHA = 0.3;
/** 아래 진한 막 세기 — 위 옅은 막과 겹쳐 72% 가 되게 푼 값: 1 − (1 − 0.72) / (1 − 0.3) = 0.6 */
const LOWER_SCRIM_ALPHA = 1 - (1 - BACKDROP_SCRIM_ALPHA) / (1 - COVER_GLOW_SCRIM_ALPHA);
/** 진한 막 페이드가 시작되는 곳 — 표지 아랫변보다 이만큼 위(표지 아랫부분에서 녹기 시작해 제목 전에 끝난다) */
const COVER_GLOW_FADE_LEAD = 80;
/** 페이드 높이 — 표지 아랫변 16pt 아래에서 솔리드가 된다(제목·메타 글자는 종전 바탕 세기 위) */
const COVER_GLOW_FADE = 96;
const rgba = (rgb: string, alpha: number): string => `rgba(${rgb}, ${alpha})`;
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
  // 진한 막 — 윗변이 표지 아래를 따라 움직인다(높이는 렌더에서: 화면 + 페이드 두 배 — 위로 다 올라가도 바닥까지 덮는다)
  lowerScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  lowerScrimFade: {
    height: COVER_GLOW_FADE,
  },
  lowerScrimSolid: {
    flex: 1,
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
    height: LIST_RULE_THICKNESS,
    marginHorizontal: theme.spacing.md,
    backgroundColor: theme.color.separator,
  },
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  // 편 사이 구분선 — 머리 아래 선과 같이 좌우 같은 여백으로 가운데(PM 2026-10-22, 종전 제목 시작선 ~ 오른쪽 끝)
  separator: {
    height: LIST_RULE_THICKNESS,
    marginHorizontal: theme.spacing.md,
    backgroundColor: theme.color.separator,
  },
});
