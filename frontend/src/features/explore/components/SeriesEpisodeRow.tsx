import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import MoreIcon from '@/shared/ui/MoreIcon';
import { Text } from '@/shared/ui/Typography';

import { EXPLORE_COPY } from '../explore.copy';
import {
  seriesEpisodeStateLabel,
  seriesEpisodeSubtitle,
  toSeriesEpisodeState,
} from '../explore.series-episode';
import type { ExploreItem, SeriesEpisode } from '../explore.types';

/** 번호 칸 폭 — 두 자리 화수까지 오른쪽 끝이 맞는다(앨범 트랙 목록 문법) */
export const SERIES_EPISODE_NUMBER_WIDTH = 32;
/** 번호 칸과 제목 사이 — 구분선 시작선 계산에도 쓴다 */
export const SERIES_EPISODE_NUMBER_GAP = 12;
/** 재생 중 표식 — 번호 왼쪽 작은 점(애플 뮤직 트랙 목록과 같은 자리) */
const NOW_PLAYING_DOT = 6;

interface SeriesEpisodeRowProps {
  episode: SeriesEpisode;
  /** 시리즈 제목 — 편 제목 앞머리(`{시리즈 제목} {N} — `)를 떼는 데 쓴다 */
  seriesTitle: string;
  /** 지금 플레이어에 올라 있는 편인가 — 번호 왼쪽 점 + 낭독 "재생 중"(색만으로 말하지 않는다) */
  isNowPlaying: boolean;
  /** 행 탭 = 탐색 행과 같은 재생 판정(재생 확인 팝업 → 재생 — explore.md 4.4) */
  onPress: (item: ExploreItem) => void;
  /** [더보기] = 탐색과 같은 시트(상세 정보·원문 보기·담기/제거 — explore.md 4.3) */
  onMorePress: (item: ExploreItem) => void;
}

/**
 * 시리즈 화면(E14)의 편 한 줄 — 앨범 트랙 목록 문법(2026-10-22 PM): 화수 번호 · 소제목(앞머리 `{시리즈 제목} {N} — ` 를 뗀 것 — 2026-10-22 PM) · `N분 · {상태}` · ⋯.
 * 썸네일은 두지 않는다 — 앨범처럼 그림은 머리 표지 한 번이다. 진행 상황은 상태 글자(완청 · N분 남음 · 담음)가 말한다
 */
export default function SeriesEpisodeRow({
  episode,
  seriesTitle,
  isNowPlaying,
  onPress,
  onMorePress,
}: SeriesEpisodeRowProps) {
  const { item } = episode;
  const state = toSeriesEpisodeState(episode);
  const stateLabel = seriesEpisodeStateLabel(state);
  const durationLabel = EXPLORE_COPY.row.durationLabel(state.minutes);
  const title = seriesEpisodeSubtitle(item.content.title, seriesTitle);
  const a11yState = [isNowPlaying ? EXPLORE_COPY.series.nowPlaying : null, stateLabel]
    .filter((part): part is string => part !== null)
    .join(', ');

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.body}
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.series.rowA11y({
          episodeNo: episode.episodeNo,
          title,
          minutes: state.minutes,
          state: a11yState.length > 0 ? a11yState : null,
        })}
      >
        <View style={styles.numberCell}>
          {isNowPlaying ? <View style={styles.nowPlayingDot} /> : null}
          <Text style={styles.number}>{episode.episodeNo}</Text>
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, isNowPlaying && styles.titleNowPlaying]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {stateLabel ? `${durationLabel} · ${stateLabel}` : durationLabel}
          </Text>
        </View>
      </Pressable>
      <Pressable
        style={styles.moreButton}
        onPress={() => onMorePress(item)}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.row.moreA11y}
      >
        <MoreIcon size={22} color={theme.color.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.xs,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SERIES_EPISODE_NUMBER_GAP,
    minHeight: 60,
    paddingVertical: theme.spacing.sm + 2,
  },
  numberCell: {
    width: SERIES_EPISODE_NUMBER_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.xs,
  },
  nowPlayingDot: {
    width: NOW_PLAYING_DOT,
    height: NOW_PLAYING_DOT,
    borderRadius: NOW_PLAYING_DOT / 2,
    backgroundColor: theme.color.textSecondary,
  },
  number: {
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
    lineHeight: Math.round(theme.font.size.md * 1.35),
  },
  titleNowPlaying: {
    fontWeight: '600',
  },
  meta: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  moreButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
