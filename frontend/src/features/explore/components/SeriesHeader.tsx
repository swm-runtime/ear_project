import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

import { theme } from '@/shared/theme';
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

/** 시리즈 제목 — 앨범 제목 자리. 큰 제목(xl 28)보다 한 단 작게, 두세 줄로 접혀도 표지를 밀어내지 않게 */
const TITLE_SIZE = 24;

interface SeriesHeaderProps {
  series: SeriesDetail['series'];
  /** 노출 중인 편 수(서버가 준 편 목록) — 계획 편수보다 적으면 "N편 중 M편 공개" */
  episodeCount: number;
}

/**
 * 시리즈 화면(E14)의 머리 — 애플 뮤직 앨범 화면 문법(2026-10-22 PM). 큰 표지(그림자) · 굵은 제목 ·
 * `시리즈 · N편 · 완결` 메타 줄 · 소개(비면 생략) 순으로 가운데에 선다. 재생·셔플·담기 버튼 줄은 두지 않는다(KAN-225 보류)
 */
export default function SeriesHeader({ series, episodeCount }: SeriesHeaderProps) {
  const { width } = useWindowDimensions();
  const coverSize = seriesCoverSize(width);
  const meta = [
    EXPLORE_COPY.series.kind,
    EXPLORE_COPY.series.episodeSummary(episodeCount, series.totalEpisodes),
    EXPLORE_COPY.series.status[series.status],
  ].join(' · ');
  const description = series.description.trim();

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
      {description.length > 0 ? <Text style={styles.description}>{description}</Text> : null}
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
  // 소개는 문단이라 왼쪽 정렬로 읽힌다 — 가운데 정렬 여러 줄은 줄 시작이 흔들린다
  description: {
    alignSelf: 'stretch',
    marginTop: theme.spacing.md,
    fontSize: theme.font.size.sm,
    lineHeight: theme.font.size.sm * 1.6,
    color: theme.color.textSecondary,
  },
});
