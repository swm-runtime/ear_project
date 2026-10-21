import { LinearGradient } from 'expo-linear-gradient';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { theme, useResolvedColor } from '@/shared/theme';
import { pillButton } from '@/shared/ui/pill-button.styles';
import PlayIcon from '@/shared/ui/PlayIcon';
import RemoteImage from '@/shared/ui/RemoteImage';
import { Text } from '@/shared/ui/Typography';

import { EXPLORE_COPY } from '../explore.copy';
import type { SeriesDetail } from '../explore.types';
import FeaturedCardBackdrop from './FeaturedCardBackdrop';

/** 표지 폭 = 화면 폭의 64%(애플 뮤직 앨범 화면 비율), 큰 화면에서 끝없이 커지지 않게 상한을 둔다 */
const COVER_WIDTH_RATIO = 0.64;
const COVER_MAX_SIZE = 320;

/** 화면 폭에서 표지 한 변을 구한다 — 스켈레톤도 같은 값을 쓴다 */
export const seriesCoverSize = (windowWidth: number): number =>
  Math.min(Math.round(windowWidth * COVER_WIDTH_RATIO), COVER_MAX_SIZE);

/** [재생] 알약 — 앨범 화면의 가운데 재생 버튼 크기(넓은 알약, 누르기 쉬운 높이) */
const PLAY_BUTTON_WIDTH = 200;
const PLAY_BUTTON_HEIGHT = 52;
const PLAY_ICON_SIZE = 22;

/** 시리즈 제목 — 앨범 제목 자리. 큰 제목(xl 28)보다 한 단 작게, 두세 줄로 접혀도 표지를 밀어내지 않게 */
const TITLE_SIZE = 24;

interface SeriesHeaderProps {
  series: SeriesDetail['series'];
  /** 노출 중인 편 수(서버가 준 편 목록) — 계획 편수보다 적으면 "N편 중 M편 공개" */
  episodeCount: number;
  /** [재생]이 틀 편(낭독용) — 없으면(편 0개) 버튼을 그리지 않는다 */
  playTarget: { episodeNo: number; title: string } | null;
  /**
   * 머리 위로 흐린 표지가 번지는 높이 — 화면 꼭대기(상태바·떠 있는 앱바)까지 올라오게 목록 상단 여백(앱바+안전영역)을
   * 그대로 받는다. 애플 뮤직 앨범 화면처럼 표지가 바탕으로 녹아들도록 표지 아래에서 배경색으로 페이드한다
   */
  topBleed: number;
  onPlay: () => void;
}

/**
 * 시리즈 화면(E14)의 머리 — 애플 뮤직 앨범 화면 문법(2026-10-22 PM). 흐린 표지 바탕(앱바·표지 둘레로 번지고 표지 아래에서
 * 배경색으로 페이드) 위에 큰 표지(그림자) · 굵은 제목 · 카테고리(대표 중분류, 없으면 생략) · `시리즈 · N편 · 완결` 메타 줄 ·
 * [재생] 알약 순으로 가운데에 선다. 글자는 표지 아래 솔리드 바탕에 앉아 모드별 기본색을 쓴다(흐린 면 위로 흰 글자를 올리면
 * 라이트 모드에서 배경색 페이드에 묻힌다). 소개 문단은 머리에서 빼고 앱바 ⋯ 시트의 [소개 전체 보기]로 옮겼다(PM 2026-10-22).
 * 셔플·담기는 두지 않는다
 */
export default function SeriesHeader({
  series,
  episodeCount,
  playTarget,
  topBleed,
  onPlay,
}: SeriesHeaderProps) {
  const { width } = useWindowDimensions();
  const coverSize = seriesCoverSize(width);
  // 다크·라이트에 따라 바뀌는 색 — svg·그라데이션·네이티브 prop 은 문자열 색만 받는다
  const playIconColor = useResolvedColor(theme.color.onPrimary);
  // 흐린 바탕을 배경색으로 녹이는 페이드 — 배경과 **같은 RGB** 에 알파만 0 으로 둔다(#RRGGBBAA). 'transparent'(투명한 검정)로
  // 두면 라이트 모드에서 흰 배경으로 가며 회색 띠가 뜬다(Android)
  const backgroundColor = useResolvedColor(theme.color.background);
  const backgroundFadeStart = `${backgroundColor}00`;
  // 흐린 표지 바탕은 화면 꼭대기(−topBleed)에서 표지 아래(여백 md + 표지 높이)까지 — 그 아래부터 솔리드 배경이다
  const backdropHeight = topBleed + theme.spacing.md + coverSize;
  const category = series.topic?.name ?? null;

  return (
    <View style={styles.root}>
      {/* 흐린 표지 바탕 + 아래로 배경색 페이드 — 표지·글자 뒤에 깔린다(본문보다 먼저 그려 뒤로 보낸다) */}
      <View
        style={[styles.backdrop, { top: -topBleed, height: backdropHeight }]}
        pointerEvents="none"
      >
        <FeaturedCardBackdrop uri={series.thumbnailUrl} recyclingKey={series.id} />
        <LinearGradient
          colors={[backgroundFadeStart, backgroundFadeStart, backgroundColor] as const}
          locations={[0, 0.55, 1] as const}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* 그림자는 바깥, 라운드·클립은 안쪽 프레임 — overflow hidden 이 iOS 그림자를 자른다 */}
      <View style={[styles.coverShadow, { width: coverSize, height: coverSize }]}>
        <View style={styles.coverFrame}>
          <RemoteImage uri={series.thumbnailUrl} recyclingKey={series.id} style={styles.cover} />
        </View>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {series.title}
      </Text>
      {/* 카테고리 — 제목 바로 아래(애플 뮤직 아티스트 자리). 대표 중분류 이름, 서버가 안 주면 줄째 생략 */}
      {category ? <Text style={styles.category}>{category}</Text> : null}
      <Text style={styles.meta}>{meta(episodeCount, series)}</Text>
      {playTarget ? (
        <Pressable
          style={({ pressed }) => [
            pillButton.base,
            pillButton.primary,
            styles.playButton,
            pressed && styles.playButtonPressed,
          ]}
          onPress={onPlay}
          accessibilityRole="button"
          accessibilityLabel={EXPLORE_COPY.series.playA11y(playTarget.episodeNo, playTarget.title)}
        >
          <PlayIcon size={PLAY_ICON_SIZE} color={playIconColor} />
          <Text style={styles.playLabel}>{EXPLORE_COPY.series.play}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 메타 줄 `시리즈 · N편 · 완결` — 카테고리가 따로 서므로 첫 칸은 종류(시리즈) 그대로 둔다 */
const meta = (episodeCount: number, series: SeriesDetail['series']): string =>
  [
    EXPLORE_COPY.series.kind,
    EXPLORE_COPY.series.episodeSummary(episodeCount, series.totalEpisodes),
    EXPLORE_COPY.series.status[series.status],
  ].join(' · ');

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  // 흐린 표지 바탕 — 머리 위로 번져 화면 꼭대기까지. 좌우 가득, top·height 는 화면에서 넘어온 값으로 칠한다
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  coverShadow: {
    marginBottom: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOpacity: 0.3,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
      },
      default: { elevation: 12 },
    }),
  },
  // 앨범 아트 반지름 md + 연속 곡률(design.md §2)
  coverFrame: {
    flex: 1,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  cover: {
    flex: 1,
  },
  title: {
    fontSize: TITLE_SIZE,
    lineHeight: Math.round(TITLE_SIZE * 1.25),
    fontWeight: '700',
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  // 카테고리 — 제목보다 한 단 작고, 메타(보조 회색)보다 또렷하게(앨범 화면의 아티스트 줄 자리)
  category: {
    marginTop: theme.spacing.xs,
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  meta: {
    marginTop: theme.spacing.sm,
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  playButton: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    width: PLAY_BUTTON_WIDTH,
    height: PLAY_BUTTON_HEIGHT,
    marginTop: theme.spacing.lg,
  },
  playButtonPressed: {
    opacity: 0.7,
  },
  playLabel: {
    fontSize: theme.font.size.md + 1,
    fontWeight: '700',
    color: theme.color.onPrimary,
  },
});
