import { Image, Platform, ScrollView, StyleSheet, View } from 'react-native';
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
import SeriesHeader from '../components/SeriesHeader';
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
  const handleScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      isDragging.value = true;
      cancelAnimation(overscroll);
    },
    onScroll: (event) => {
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
    // '다른 항목' 존이 있으면 그 톤이 바닥까지 이어지도록 바닥 여백을 존이 책임진다(아래 contentContainer·zone 참조)
    const hasMoreSections =
      screen.otherSeries.length > 0 || screen.relatedItems.length > 0;
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
            {/* 마지막 편 아래도 같은 구분선으로 닫는다(PM 2026-10-22) — 편 사이 선(ItemSeparator)은 마지막 뒤에 안 붙는다 */}
            {screen.episodes.length > 0 ? <RowSeparator /> : null}
            {/* 발행일자 — 'N편, 길이' 위(애플 뮤직 앨범 하단, PM 2026-10-22). 서버가 안 주면 줄째 생략 */}
            {series.publishedAt ? (
              <Text style={styles.publishedAt}>
                {EXPLORE_COPY.series.publishedAt(series.publishedAt)}
              </Text>
            ) : null}
            <Text style={styles.footer}>
              {EXPLORE_COPY.series.footer(screen.episodeCount, totalMinutes)}
            </Text>
            {/* 간단한 소개 — 'N편, 길이' 아래(앨범 하단 노트 자리). 전문은 앱바 ⋯ [소개 전체 보기], 여기선 짧게(PM 2026-10-22) */}
            {series.description.trim().length > 0 ? (
              <Text style={styles.footerDescription}>{series.description.trim()}</Text>
            ) : null}
            {/* 애플 뮤직 앨범 화면 아래 두 줄(PM 2026-10-22) — 비면 줄째 숨는다. 앨범 구역(흐린 표지 바탕)과 톤을
                달리해 '다른 항목' 영역으로 가른다(PM 2026-10-22 — surface 면). 둘 다 비면 빈 면이 뜨지 않게 존째 생략 */}
            {hasMoreSections ? (
              <View
                style={[
                  styles.moreSectionsZone,
                  { paddingBottom: dockInset + theme.spacing.lg },
                ]}
              >
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
            ) : null}
          </View>
        }
        {...DOCK_SCROLL_PROPS}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: listTopInset,
          // 추천 존이 있으면 그 톤이 바닥까지 이어지도록 존이 바닥 여백을 갖는다(존 없으면 리스트가 비운다)
          paddingBottom: hasMoreSections ? 0 : dockInset + theme.spacing.lg,
        }}
      />
    );
  };

  return (
    <View style={styles.container}>
      {/*
       * [진단 2026-10-22 PM "맨 위에서 당겼다 놓으면 튕기지 않고 원래 위치로 바로 바뀐다" — 시리즈 화면만]
       * 이 화면만 시스템 바를 숨기는데, react-native-screens 는 숨김일 때 largeTitleDisplayMode 를 안 건드려 탐색 홈의
       * 큰 제목 모드가 남고, 우리 RNS 패치(earRegisterContentScrollView)가 목록을 바의 콘텐츠 스크롤 뷰로 등록한다 →
       * UIKit 큰 제목 처리가 놓는 순간 목록 위치를 맞추는 것으로 의심. 패치는 "화면 절반 이상 높이의 첫 UIScrollView"를
       * 고르므로, 맨 앞에 보이지 않는 빈 스크롤 뷰를 둬 UIKit 이 이것을 보게 한다. 확인되면 패치 쪽(숨김 화면은 Never)
       * 으로 옮기고 이 뷰는 걷는다
       */}
      {Platform.OS === 'ios' ? (
        <ScrollView
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          scrollEnabled={false}
          contentInsetAdjustmentBehavior="never"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
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
          <View
            style={[
              styles.backdropScrim,
              { backgroundColor: scheme === 'dark' ? BACKDROP_SCRIM_DARK : BACKDROP_SCRIM_LIGHT },
            ]}
          />
        </Animated.View>
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
 * `border`(#E3E3E8)는 흐린 표지 배경·회색 재생 중 행 옆에서 묻혔다. 색은 흐린 그림 위 구분선(`separatorOnMaterial` — 비비드 구분선
 * 흉내, 다크 흰 16% · 라이트 검정 14%). 시스템 separator 회색은 흐린 바탕 중간 톤과 밝기가 같아 여전히 안 보였다(PM 2026-10-22 17:55)
 */
const LIST_RULE_THICKNESS = 1;

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
    height: LIST_RULE_THICKNESS,
    marginHorizontal: theme.spacing.md,
    backgroundColor: theme.color.separatorOnMaterial,
  },
  // 발행일자 — 'N편, 길이' 위 보조 줄(앨범 하단 발행일)
  publishedAt: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  footer: {
    paddingHorizontal: theme.spacing.md,
    // 발행일자와 한 묶음으로 바싹 — 셋을 가깝게(PM 2026-10-22 "간격 줄여")
    paddingTop: theme.spacing.xs,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  // 간단한 소개 — 'N편, 길이' 아래. 전문은 앱바 ⋯ 시트에, 여기선 줄 간격을 둔 짧은 문단
  footerDescription: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    fontSize: theme.font.size.sm,
    lineHeight: theme.font.size.sm * 1.6,
    color: theme.color.textSecondary,
  },
  // '다른 항목' 영역 — 위 앨범 구역과 같은 흐린 표지 바탕을 그대로 이어받되 톤만 조금 더 어둡게(반투명 검정 덮개)
  // 해서 단색 경계 없이 자연스럽게 가른다(PM 2026-10-22 — "표지색에서 톤만 더 어둡게"). 바닥 여백(dockInset)은
  // 인라인으로 줘 어두운 톤이 바닥(독 뒤)까지 끊김 없이 이어진다
  moreSectionsZone: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  // 편 사이 구분선 — 머리 아래 선과 같이 좌우 같은 여백으로 가운데(PM 2026-10-22, 종전 제목 시작선 ~ 오른쪽 끝)
  separator: {
    height: LIST_RULE_THICKNESS,
    marginHorizontal: theme.spacing.md,
    backgroundColor: theme.color.separatorOnMaterial,
  },
});
