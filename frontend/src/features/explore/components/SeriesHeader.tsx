import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import RemoteImage from '@/shared/ui/RemoteImage';
import { Text } from '@/shared/ui/Typography';

import { EXPLORE_COPY } from '../explore.copy';
import type { SeriesDetail } from '../explore.types';

/** 표지 한 변 — 화면 폭과 무관한 고정값. 아래 제목·소개가 첫 화면에 같이 들어오게 너무 크지 않게 */
export const SERIES_COVER_SIZE = 176;

interface SeriesHeaderProps {
  series: SeriesDetail['series'];
  /** 노출 중인 편 수(서버가 준 편 목록) — 계획 편수보다 적으면 "N편 중 M편 공개" */
  episodeCount: number;
}

/**
 * 시리즈 화면(E14)의 머리 — 표지(1화 썸네일) · 시리즈 제목 · 편수 · 연재 상태 · 소개(explore.md 4.7).
 * 소개가 빈 문자열이면(소개 없음 — domain.md 5.9) 문단을 그리지 않는다. 다음 화 듣기 버튼은 두지 않는다(보류)
 */
export default function SeriesHeader({ series, episodeCount }: SeriesHeaderProps) {
  const summary = [
    EXPLORE_COPY.series.episodeSummary(episodeCount, series.totalEpisodes),
    EXPLORE_COPY.series.status[series.status],
  ].join(' · ');
  const description = series.description.trim();

  return (
    <View style={styles.root}>
      <View style={styles.coverFrame}>
        <RemoteImage uri={series.thumbnailUrl} recyclingKey={series.id} style={styles.cover} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {series.title}
      </Text>
      <Text style={styles.summary}>{summary}</Text>
      {description.length > 0 ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  // 썸네일(대표 카드·타일) 반지름 lg + 연속 곡률 — 라운드·클립은 프레임이 한다(design.md §2)
  coverFrame: {
    width: SERIES_COVER_SIZE,
    height: SERIES_COVER_SIZE,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: theme.color.surface,
  },
  cover: {
    flex: 1,
  },
  title: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  summary: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  // 소개는 문단이라 왼쪽 정렬로 읽힌다 — 가운데 정렬 여러 줄은 줄 시작이 흔들린다
  description: {
    alignSelf: 'stretch',
    marginTop: theme.spacing.sm,
    fontSize: theme.font.size.sm,
    lineHeight: theme.font.size.sm * 1.6,
    color: theme.color.textPrimary,
  },
});
