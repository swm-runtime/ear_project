import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import LockIcon from '@/shared/ui/LockIcon';
import MoreIcon from '@/shared/ui/MoreIcon';
import { Text } from '@/shared/ui/Typography';

import { EXPLORE_COPY } from '../explore.copy';
import {
  seriesEpisodeStateLabel,
  seriesEpisodeSubtitle,
  toSeriesEpisodeState,
} from '../explore.series-episode';
import type { ExploreItem, SeriesEpisode } from '../explore.types';
import NowPlayingBars from './NowPlayingBars';

/** 번호 칸 폭 — 두 자리 화수까지 들어간다. 번호는 칸 가운데(PM 2026-10-22) */
export const SERIES_EPISODE_NUMBER_WIDTH = 32;
/** 번호 칸과 제목 사이 — 구분선 시작선 계산에도 쓴다 */
export const SERIES_EPISODE_NUMBER_GAP = 12;
/** 메타 줄 앞 자물쇠 — 메타 글자(xs)와 같은 높이(애플 팟캐스트 구독자 전용 편의 작은 자물쇠) */
const LOCK_ICON_SIZE = 11;

interface SeriesEpisodeRowProps {
  episode: SeriesEpisode;
  /** 시리즈 제목 — 편 제목 앞머리(`{시리즈 제목} {N} — `)를 떼는 데 쓴다 */
  seriesTitle: string;
  /**
   * 지금 플레이어에 올라 있는 편인가 — 번호 자리 막대 + 행 면 강조 + 굵은 제목 + 낭독 "재생 중"(애플 뮤직 트랙 목록,
   * PM 2026-10-22 — 종전 번호 왼쪽 점은 애플에선 "안 들은 편" 표식이라 걷었다. 색만으로 말하지 않는다)
   */
  isNowPlaying: boolean;
  /** 플레이어가 지금 소리를 내는가 — 막대가 움직이는지만 가른다(일시정지면 멈춘 막대) */
  isPlaying: boolean;
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
  isPlaying,
  onPress,
  onMorePress,
}: SeriesEpisodeRowProps) {
  const { item } = episode;
  const state = toSeriesEpisodeState(episode);
  const stateLabel = seriesEpisodeStateLabel(state);
  const durationLabel = EXPLORE_COPY.row.durationLabel(state.minutes);
  const title = seriesEpisodeSubtitle(item.content.title, seriesTitle);
  // 잠긴 편(KAN-294) — 서버 `is_locked` 그대로. 화수로 앱이 다시 계산하지 않는다
  const isLocked = item.content.isLocked;
  const a11yState = [
    isNowPlaying ? EXPLORE_COPY.series.nowPlaying : null,
    isLocked ? EXPLORE_COPY.series.state.locked : null,
    stateLabel,
  ]
    .filter((part): part is string => part !== null)
    .join(', ');

  return (
    <View style={[styles.row, isNowPlaying && styles.rowNowPlaying]}>
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
          {/* 재생 중인 편은 번호 대신 막대(애플 뮤직) — 칸 폭은 같아 제목 시작선이 흔들리지 않는다 */}
          {isNowPlaying ? (
            <NowPlayingBars color={theme.color.textPrimary} isPlaying={isPlaying} />
          ) : (
            <Text style={styles.number}>{episode.episodeNo}</Text>
          )}
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, isNowPlaying && styles.titleNowPlaying]} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.metaRow}>
            {/* 잠긴 편 — 메타 줄 앞 작은 자물쇠(장식 — 낭독은 행 라벨의 "잠김"이 한다) */}
            {isLocked ? (
              <View
                testID="series-episode-lock"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <LockIcon size={LOCK_ICON_SIZE} color={theme.color.textSecondary} />
              </View>
            ) : null}
            <Text style={styles.meta} numberOfLines={1}>
              {stateLabel ? `${durationLabel} · ${stateLabel}` : durationLabel}
            </Text>
          </View>
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
  // 재생 중인 편 — 행 전체에 옅은 면(애플 뮤직처럼 행이 다른 색. 앱 테마가 흑백이라 강조색 대신 iOS tertiarySystemFill)
  rowNowPlaying: {
    backgroundColor: theme.color.fillTertiary,
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  meta: {
    flexShrink: 1,
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
