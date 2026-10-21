import { useState } from 'react';
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

/** 번호 칸 폭 — 두 자리 화수까지 들어간다. 번호는 칸 가운데(PM 2026-10-22) */
export const SERIES_EPISODE_NUMBER_WIDTH = 32;
/** 번호 칸과 제목 사이 — 구분선 시작선 계산에도 쓴다 */
export const SERIES_EPISODE_NUMBER_GAP = 12;
/**
 * 재생 중 표식 — **화면 왼쪽 끝과 번호 글자 사이의 정가운데** 작은 점(PM 2026-10-22 08:39 "중앙으로". 종전 "점은 리스트 밖으로"는
 * 왼쪽 여백 가운데라 번호와 25pt 떨어져 매달려 보였다). 번호 글자 폭(한·두 자리)을 재서 그 왼쪽 끝과 화면 끝의 가운데에 둔다.
 * 번호 자리는 점 유무와 상관없이 그대로다
 */
const NOW_PLAYING_DOT = 6;
/** 재기 전 번호 글자 왼쪽 끝 추정 — 한 자리 글자(약 9pt)가 32 칸 가운데일 때 */
const NUMBER_GLYPH_LEFT_ESTIMATE = theme.spacing.md + (SERIES_EPISODE_NUMBER_WIDTH - 9) / 2;

interface SeriesEpisodeRowProps {
  episode: SeriesEpisode;
  /** 시리즈 제목 — 편 제목 앞머리(`{시리즈 제목} {N} — `)를 떼는 데 쓴다 */
  seriesTitle: string;
  /** 지금 플레이어에 올라 있는 편인가 — 왼쪽 여백 점 + 굵은 제목 + 낭독 "재생 중"(색만으로 말하지 않는다) */
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
  // 번호 글자의 왼쪽 끝(행 기준) — 재생 중 점을 화면 끝과 그 사이 가운데에 두려고 잰다
  const [numberLeft, setNumberLeft] = useState<number | null>(null);
  const dotLeft = (numberLeft ?? NUMBER_GLYPH_LEFT_ESTIMATE) / 2 - NOW_PLAYING_DOT / 2;

  return (
    <View style={styles.row}>
      {isNowPlaying ? (
        <View style={[styles.nowPlayingDot, { left: dotLeft }]} pointerEvents="none" />
      ) : null}
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
          {/* 글자 상자만 감싸 왼쪽 끝을 잰다(칸 안 가운데 정렬이라 x = 칸 왼쪽 여백). 행 왼쪽 여백(md) + 그 x = 글자 왼쪽 끝 */}
          <View
            onLayout={
              isNowPlaying
                ? (event) => setNumberLeft(theme.spacing.md + event.nativeEvent.layout.x)
                : undefined
            }
          >
            <Text style={styles.number}>{episode.episodeNo}</Text>
          </View>
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, isNowPlaying && styles.titleNowPlaying]} numberOfLines={1}>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 화면 끝과 번호 글자 사이 가운데(left 는 렌더에서) — 세로는 행 가운데
  nowPlayingDot: {
    position: 'absolute',
    top: '50%',
    marginTop: -NOW_PLAYING_DOT / 2,
    width: NOW_PLAYING_DOT,
    height: NOW_PLAYING_DOT,
    borderRadius: NOW_PLAYING_DOT / 2,
    backgroundColor: theme.color.textSecondary,
  },
  number: {
    textAlign: 'center',
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
