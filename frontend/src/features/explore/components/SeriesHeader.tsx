import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { theme, useResolvedColor } from '@/shared/theme';
import { pillButton } from '@/shared/ui/pill-button.styles';
import PlayIcon from '@/shared/ui/PlayIcon';
import RemoteImage from '@/shared/ui/RemoteImage';
import { Text } from '@/shared/ui/Typography';

import { EXPLORE_COPY } from '../explore.copy';
import type { SeriesDetail } from '../explore.types';

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
  onPlay: () => void;
}

/**
 * 시리즈 화면(E14)의 머리 — 애플 뮤직 앨범 화면 문법(2026-10-22 PM). 큰 표지(그림자) · 굵은 제목 ·
 * `시리즈 · N편 · 완결` 메타 줄 · [재생] 알약 순으로 가운데에 선다. 소개 문단은 머리에서 빼고 앱바 ⋯ 시트의
 * [소개 전체 보기]로 옮겼다(PM 2026-10-22 — 소개 자리에 "재생"). 셔플·담기는 두지 않는다
 */
export default function SeriesHeader({
  series,
  episodeCount,
  playTarget,
  onPlay,
}: SeriesHeaderProps) {
  const { width } = useWindowDimensions();
  const coverSize = seriesCoverSize(width);
  // 다크·라이트에 따라 바뀌는 색 — svg 는 문자열 색만 받는다
  const playIconColor = useResolvedColor(theme.color.onPrimary);
  const meta = [
    EXPLORE_COPY.series.kind,
    EXPLORE_COPY.series.episodeSummary(episodeCount, series.totalEpisodes),
    EXPLORE_COPY.series.status[series.status],
  ].join(' · ');

  return (
    <View style={styles.root}>
      {/* 그림자는 바깥, 라운드·클립은 안쪽 프레임 — overflow hidden 이 iOS 그림자를 자른다 */}
      <View style={[styles.coverShadow, { width: coverSize, height: coverSize }]}>
        <View style={styles.coverFrame}>
          <RemoteImage uri={series.thumbnailUrl} recyclingKey={series.id} style={styles.cover} />
        </View>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {series.title}
      </Text>
      <Text style={styles.meta}>{meta}</Text>
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

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
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
