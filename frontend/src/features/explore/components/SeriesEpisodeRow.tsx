import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import MoreIcon from '@/shared/ui/MoreIcon';
import RemoteImage from '@/shared/ui/RemoteImage';
import { Text } from '@/shared/ui/Typography';

import { EXPLORE_COPY } from '../explore.copy';
import { seriesEpisodeStateLabel, toSeriesEpisodeState } from '../explore.series-episode';
import type { ExploreItem, SeriesEpisode } from '../explore.types';

/** 편 썸네일 한 변 — 상세 헤더(72)보다 한 단 작게, 목록 행이 화면에 여러 개 들어가게 */
export const SERIES_EPISODE_THUMBNAIL_SIZE = 64;
/** 썸네일 아래 변 진행 바 — 라이브러리 타일과 같은 4pt(design.md §5 격자 타일) */
const PROGRESS_HEIGHT = 4;
/** 번호 · 제목 · 상태 세 줄 사이 — 한 덩어리로 읽히게 xs(4)의 절반 */
const INFO_LINE_GAP = 2;

interface SeriesEpisodeRowProps {
  episode: SeriesEpisode;
  /** 행 탭 = 탐색 행과 같은 재생 판정(재생 확인 팝업 → 재생 — explore.md 4.4) */
  onPress: (item: ExploreItem) => void;
  /** [더보기] = 탐색과 같은 시트(상세 정보·원문 보기·담기/제거 — explore.md 4.3) */
  onMorePress: (item: ExploreItem) => void;
}

/**
 * 시리즈 화면(E14)의 편 한 줄 — 번호 · 제목(원래 제목 그대로, 시리즈 이름을 빼지 않는다) · 길이 · 내 상태.
 * 상태는 서버 값을 글자로 옮기고(완청 · N분 남음 · 담음), 듣다 만 편·완청 편은 썸네일 아래 변 진행 바를 함께 둔다 —
 * 색·길이만으로 상태를 말하지 않는다(design.md §1)
 */
export default function SeriesEpisodeRow({ episode, onPress, onMorePress }: SeriesEpisodeRowProps) {
  const { item } = episode;
  const state = toSeriesEpisodeState(episode);
  const stateLabel = seriesEpisodeStateLabel(state);
  const durationLabel = EXPLORE_COPY.row.durationLabel(state.minutes);

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.body}
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.series.rowA11y({
          episodeNo: episode.episodeNo,
          title: item.content.title,
          minutes: state.minutes,
          state: stateLabel,
        })}
      >
        <View style={styles.thumbnailFrame}>
          <RemoteImage
            uri={item.content.thumbnailUrl}
            recyclingKey={item.content.id}
            style={styles.thumbnail}
          />
          {state.progressRatio !== null ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${state.progressRatio * 100}%` }]} />
            </View>
          ) : null}
        </View>
        <View style={styles.info}>
          <Text style={styles.episodeNo}>{EXPLORE_COPY.series.episodeNo(episode.episodeNo)}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {item.content.title}
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
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  // 라운드·클립은 프레임(View)이 한다 — expo-image 는 borderCurve 를 모른다(design.md §2)
  thumbnailFrame: {
    width: SERIES_EPISODE_THUMBNAIL_SIZE,
    height: SERIES_EPISODE_THUMBNAIL_SIZE,
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: theme.color.surface,
  },
  thumbnail: {
    flex: 1,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: PROGRESS_HEIGHT,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.color.progress,
  },
  info: {
    flex: 1,
    gap: INFO_LINE_GAP,
  },
  episodeNo: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  title: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.sm * 1.35,
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
