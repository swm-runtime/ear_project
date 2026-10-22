import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { theme, useActiveScheme, useResolvedColor } from '@/shared/theme';
import { pillButton } from '@/shared/ui/pill-button.styles';
import PlayIcon from '@/shared/ui/PlayIcon';
import RemoteImage from '@/shared/ui/RemoteImage';
import { Text } from '@/shared/ui/Typography';

import { EXPLORE_COPY } from '../explore.copy';
import type { SeriesDetail } from '../explore.types';
import FeaturedCardBackdrop from './FeaturedCardBackdrop';
import { PlusIcon, ShuffleIcon, TrashIcon } from './SeriesActionIcons';

/** 표지 폭 = 화면 폭의 64%(애플 뮤직 앨범 화면 비율), 큰 화면에서 끝없이 커지지 않게 상한을 둔다 */
const COVER_WIDTH_RATIO = 0.64;
const COVER_MAX_SIZE = 320;

/** 화면 폭에서 표지 한 변을 구한다 — 스켈레톤도 같은 값을 쓴다 */
export const seriesCoverSize = (windowWidth: number): number =>
  Math.min(Math.round(windowWidth * COVER_WIDTH_RATIO), COVER_MAX_SIZE);

/** [재생] 알약 — 앨범 화면 가운데 재생 버튼. 양옆 원(셔플·담기)과 균형 잡히게 좁혔다(PM 2026-10-22 "재생 가로 줄이자") */
const PLAY_BUTTON_WIDTH = 150;
const PLAY_BUTTON_HEIGHT = 52;
const PLAY_ICON_SIZE = 22;
/** [재생] 양옆 원(셔플 · 담기) — 알약과 같은 높이의 원, 아이콘 22(애플 뮤직 앨범 화면) */
const SIDE_BUTTON_SIZE = PLAY_BUTTON_HEIGHT;
const SIDE_ICON_SIZE = 22;

/**
 * 맨 위에서 당긴 거리 중 표지가 키우는 몫 — 당긴 빈자리의 절반만큼 표지가 위로 자란다(아래 끝은 제목 위에 고정).
 * 다 채우면 표지가 앱바 버튼 밑으로 파고든다
 */
const COVER_STRETCH_SHARE = 0.5;
/**
 * 표지 뒤 비침(PM 2026-10-22 15:37·16:01 스샷 "이렇게 비치게") — 머리 영역에만 흐린 표지 한 장(탐색 대표 카드와 같은 흐림 36 ·
 * 막 45%). 화면 전체 바탕(흐림 60)은 세로로 크게 확대돼 한 가지 색으로 뭉개지지만, 이 한 장은 가로 폭에 맞춰 표지 구도가
 * 남는다. 아래 끝은 마스크로 투명하게 녹여 밑의 화면 바탕(종전 그대로)이 이어진다. 페이드는 표지 아랫변 GLOW_LEAD 위에서
 * 시작해 GLOW_TAIL 아래에서 끝난다 — 제목 글자(표지 아래 lg)는 종전 바탕 위에 앉는다
 */
const GLOW_LEAD = 48;
const GLOW_TAIL = 20;
const GLOW_SCRIM_LIGHT = 'rgba(255, 255, 255, 0.35)';

/** 시리즈 제목 — 앨범 제목 자리. 큰 제목(xl 28)보다 한 단 작게, 두세 줄로 접혀도 표지를 밀어내지 않게 */
const TITLE_SIZE = 24;

interface SeriesHeaderProps {
  series: SeriesDetail['series'];
  /** 머리 윗변에서 화면 꼭대기까지(상단 안전영역 + 앱바) — 표지 뒤 흐린 표지가 화면 꼭대기까지 번진다 */
  topBleed: number;
  /** 목록 맨 위에서 더 당긴 거리(pt, 0 이상) — 표지가 손을 따라 커졌다가 돌아온다(PM 2026-10-22) */
  overscroll: SharedValue<number>;
  /** 노출 중인 편 수(서버가 준 편 목록) — 계획 편수보다 적으면 "N편 중 M편 공개" */
  episodeCount: number;
  /** [재생]이 틀 편(낭독용) — 없으면(편 0개) 버튼을 그리지 않는다 */
  playTarget: { episodeNo: number; title: string } | null;
  onPlay: () => void;
  /** 셔플 — 무작위 한 편 + 재생 목록 순서 섞기(자동 다음 재생 없음) */
  onShuffle: () => void;
  /** 시리즈 담기 — 라이브러리에 없는 편 전부를 편 단위로 */
  onSaveSeries: () => void;
  /** 시리즈째 빼기 — 노출 편 중 라이브러리에 있는 편 전부(실행 취소 토스트) */
  onRemoveSeries: () => void;
  /** 노출 편이 전부 라이브러리에 있다 — 담기 원이 휴지통(빼기)으로 바뀐다(PM 2026-10-22 14:22) */
  isSeriesSaved: boolean;
}

/**
 * 시리즈 화면(E14)의 머리 — 애플 뮤직 앨범 화면 문법(2026-10-22 PM). 화면 전체에 깔린 흐린 표지 바탕(플레이어와 같다 — `SeriesScreen`) 위에 큰 표지(그림자) · 굵은 제목 · 카테고리(대표 중분류, 없으면 생략) · `시리즈 · N편 · 완결` 메타 줄 ·
 * [재생] 알약 순으로 가운데에 선다. 글자는 표지 아래 솔리드 바탕에 앉아 모드별 기본색을 쓴다(흐린 면 위로 흰 글자를 올리면
 * 라이트 모드에서 배경색 페이드에 묻힌다). 소개 문단은 머리에서 빼고 앱바 ⋯ 시트의 [소개 전체 보기]로 옮겼다(PM 2026-10-22).
 * [재생] 양옆은 셔플 · 담기(전부 담겼으면 빼기) 원이다
 */
export default function SeriesHeader({
  series,
  overscroll,
  topBleed,
  episodeCount,
  playTarget,
  onPlay,
  onShuffle,
  onSaveSeries,
  onRemoveSeries,
  isSeriesSaved,
}: SeriesHeaderProps) {
  const { width } = useWindowDimensions();
  const coverSize = seriesCoverSize(width);
  // 다크·라이트에 따라 바뀌는 색 — svg·그라데이션·네이티브 prop 은 문자열 색만 받는다
  const playIconColor = useResolvedColor(theme.color.onPrimary);
  const category = series.topic?.name ?? null;
  // 아래 끝을 고정하고 위로 자란다 — 가운데 기준 scale 을 자란 높이 절반만큼 올려 보정
  const coverStretchStyle = useAnimatedStyle(() => {
    const grow = overscroll.value * COVER_STRETCH_SHARE;
    return {
      transform: [{ translateY: -grow / 2 }, { scale: 1 + grow / coverSize }],
    };
  });

  // 흐린 표지 한 장 — 화면 꼭대기(당긴 만큼 더 위)부터 표지 아래 GLOW_TAIL 까지. 표지는 아래 끝 고정으로 자라므로 아래 끝도 고정
  const glowStyle = useAnimatedStyle(() => ({
    top: -(topBleed + overscroll.value),
    height: topBleed + overscroll.value + theme.spacing.md + coverSize + GLOW_TAIL,
  }));
  const scheme = useActiveScheme();

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none">
        <MaskedView
          style={StyleSheet.absoluteFill}
          maskElement={
            <View style={StyleSheet.absoluteFill}>
              <View style={styles.glowMaskSolid} />
              <LinearGradient
                colors={['#000000', '#00000000']}
                style={{ height: GLOW_LEAD + GLOW_TAIL }}
              />
            </View>
          }
        >
          <View style={StyleSheet.absoluteFill}>
            <FeaturedCardBackdrop
              uri={series.thumbnailUrl}
              recyclingKey={series.id}
              scrimColor={scheme === 'dark' ? undefined : GLOW_SCRIM_LIGHT}
            />
          </View>
        </MaskedView>
      </Animated.View>
      {/* 그림자는 바깥, 라운드·클립은 안쪽 프레임 — overflow hidden 이 iOS 그림자를 자른다 */}
      <Animated.View
        style={[styles.coverShadow, { width: coverSize, height: coverSize }, coverStretchStyle]}
      >
        <View style={styles.coverFrame}>
          <RemoteImage uri={series.thumbnailUrl} recyclingKey={series.id} style={styles.cover} />
        </View>
      </Animated.View>
      <Text style={styles.title} accessibilityRole="header">
        {series.title}
      </Text>
      {/* 카테고리 — 제목 바로 아래(애플 뮤직 아티스트 자리). 대표 중분류 이름, 서버가 안 주면 줄째 생략 */}
      {category ? <Text style={styles.category}>{category}</Text> : null}
      <Text style={styles.meta}>{meta(episodeCount, series)}</Text>
      {playTarget ? (
        // [셔플] · [재생] · [담기] 한 줄(PM 2026-10-22 08:55 — 애플 뮤직 앨범 화면). 좁은 화면에선 알약만 줄어든다
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [styles.sideButton, pressed && styles.playButtonPressed]}
            onPress={onShuffle}
            accessibilityRole="button"
            accessibilityLabel={EXPLORE_COPY.series.shuffleA11y}
          >
            <ShuffleIcon size={SIDE_ICON_SIZE} color={theme.color.textPrimary} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              pillButton.base,
              pillButton.primary,
              styles.playButton,
              pressed && styles.playButtonPressed,
            ]}
            onPress={onPlay}
            accessibilityRole="button"
            accessibilityLabel={EXPLORE_COPY.series.playA11y(
              playTarget.episodeNo,
              playTarget.title,
            )}
          >
            <PlayIcon size={PLAY_ICON_SIZE} color={playIconColor} />
            <Text style={styles.playLabel}>{EXPLORE_COPY.series.play}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.sideButton,
              isSeriesSaved && styles.removeButton,
              pressed && styles.playButtonPressed,
            ]}
            onPress={isSeriesSaved ? onRemoveSeries : onSaveSeries}
            accessibilityRole="button"
            accessibilityLabel={
              isSeriesSaved ? EXPLORE_COPY.series.removeAllA11y : EXPLORE_COPY.series.saveAllA11y
            }
          >
            {isSeriesSaved ? (
              // 시리즈째 빼기 — 채운 빨강 원 + 흰 휴지통(두 모드 흰색 onPhoto — onPrimary 는 다크에서 검정, PM 2026-10-22 "휴지통 흰색으로")
              <TrashIcon size={SIDE_ICON_SIZE} color={theme.color.onPhoto} />
            ) : (
              <PlusIcon size={SIDE_ICON_SIZE} color={theme.color.textPrimary} />
            )}
          </Pressable>
        </View>
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
  // 표지 뒤 흐린 표지 — 좌우 가득, top·height 는 렌더에서(화면 꼭대기 ~ 표지 아래). 확대(1.2) 가장자리가 밖으로 새지 않게 자른다
  glow: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  glowMaskSolid: {
    flex: 1,
    backgroundColor: '#000000',
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
  // [셔플] · [재생] · [담기] — 가운데 정렬, 사이 md. 화면이 좁으면 알약이 줄어든다(원은 그대로)
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
    alignSelf: 'stretch',
    marginTop: theme.spacing.lg,
  },
  playButton: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    width: PLAY_BUTTON_WIDTH,
    flexShrink: 1,
    height: PLAY_BUTTON_HEIGHT,
  },
  // 양옆 원 — 흐린 표지 바탕 위 반투명 회색 면(다크·라이트 둘 다 비친다), 아이콘은 모드 기본 글자색
  sideButton: {
    width: SIDE_BUTTON_SIZE,
    height: SIDE_BUTTON_SIZE,
    borderRadius: SIDE_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(127, 127, 127, 0.24)',
  },
  // 시리즈째 빼기 상태 — 채운 빨강 원(iOS 파괴 동작). PM 2026-10-22 "아이콘 배경이 빨간색"
  // palette.ts는 채운 danger를 배경으로 쓰지 말라 하지만(주 버튼과 위계 역전) PM이 이 버튼엔 명시 지시
  removeButton: {
    backgroundColor: theme.color.danger,
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
