import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import { Text } from '@/shared/ui/Typography';

import { CONTENT_DETAIL_COPY } from '../content-detail.copy';
import {
  formatContentDuration,
  formatPublishedDate,
  formatSeriesLabel,
} from '../content-detail.format';
import type { ContentDetailContent } from '../content-detail.types';

interface ContentDetailMetaProps {
  content: ContentDetailContent;
  /**
   * 시리즈 줄 탭 → 시리즈 화면(E14, KAN-225). 시리즈 id 를 모르는 응답(구버전 서버 — `id`·`series_id` 둘 다 없음)이면
   * 줄은 보이되 눌리지 않는다
   */
  onSeriesPress?: (seriesId: string) => void;
}

/**
 * 메타 영역 — 길이 · 발행일 · 시리즈(조건부)의 라벨·값 행 목록(content-detail.md 4.2).
 * 시리즈는 응답 값의 null 여부 하나로 판정한다 — null이면 줄을 통째로 생략하고 자리를
 * 비워두거나 "없음"으로 채우지 않는다(4.3-1). 두 줄 화면과 세 줄 화면이 있는 것이 정상이다.
 *
 * **라벨 열 폭은 가장 긴 라벨에 맞춘다** — 고정 최소 폭(56)만 두면 영어 "Published" 처럼 긴 라벨의 행만 값이 오른쪽으로
 * 밀려 값 열이 어긋났다(2026-10-18 영어 QA). 언어·글꼴 크기와 무관하게 실측한 최대 폭을 모든 라벨의 최소 폭으로 준다.
 * 한국어 라벨("길이"·"발행일"·"시리즈")은 기본 글꼴에서 56 보다 짧아 종전과 같다
 */
export default function ContentDetailMeta({ content, onSeriesPress }: ContentDetailMetaProps) {
  const [labelWidth, setLabelWidth] = useState(LABEL_MIN_WIDTH);
  const handleLabelLayout = (event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width);
    setLabelWidth((current) => (width > current ? width : current));
  };
  const labelStyle = [styles.label, { minWidth: labelWidth }];

  /**
   * 시리즈 줄 값 — "{시리즈 제목} · N부작 중 M화"(4.3-1). 시리즈 id 가 있으면 뒤에 셰브론을 단 글자 버튼이고 누르면 시리즈 화면을
   * 연다. 보이는 줄 높이는 그대로 두고 터치만 hitSlop 으로 44 까지 넓힌다(design.md §6 — 메타 행 간격을 벌리지 않는다)
   */
  const renderSeriesValue = (series: NonNullable<ContentDetailContent['series']>) => {
    const label = formatSeriesLabel(series);
    const { seriesId } = series;
    if (seriesId === null || !onSeriesPress) return <Text style={styles.value}>{label}</Text>;
    return (
      <Pressable
        style={({ pressed }) => [styles.seriesButton, pressed ? styles.seriesPressed : null]}
        onPress={() => onSeriesPress(seriesId)}
        hitSlop={SERIES_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={CONTENT_DETAIL_COPY.meta.seriesOpenA11y(label)}
      >
        <Text style={styles.seriesValue}>{label}</Text>
        <ChevronIcon
          direction="right"
          size={SERIES_CHEVRON_SIZE}
          color={theme.color.textSecondary}
        />
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Text style={labelStyle} onLayout={handleLabelLayout}>
          {CONTENT_DETAIL_COPY.meta.duration}
        </Text>
        {/* 표기 문자열 그대로 낭독된다 — "861초"·"14:21"로 읽히지 않는다(uiux 7장) */}
        <Text style={styles.value}>{formatContentDuration(content.durationSec)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={labelStyle} onLayout={handleLabelLayout}>
          {CONTENT_DETAIL_COPY.meta.publishedAt}
        </Text>
        <Text style={styles.value}>{formatPublishedDate(content.publishedAt)}</Text>
      </View>
      {content.series !== null ? (
        <View style={styles.row}>
          <Text style={labelStyle} onLayout={handleLabelLayout}>
            {CONTENT_DETAIL_COPY.meta.series}
          </Text>
          {renderSeriesValue(content.series)}
        </View>
      ) : null}
    </View>
  );
}

/** 라벨 열의 바닥 폭 — 실측한 최대 라벨 폭이 이보다 크면 그 값을 쓴다 */
const LABEL_MIN_WIDTH = 56;
/** 시리즈 줄 셰브론 — 본문 글자(sm 14)보다 작게, 이동 표시만 */
const SERIES_CHEVRON_SIZE = 14;
/** 한 줄(약 20) 높이를 44 로 — 위아래 12 */
const SERIES_HIT_SLOP = { top: 12, bottom: 12 } as const;
/** 누르는 동안 — iOS 글자 버튼의 눌림(옅어짐), 대표 카드 태그와 같은 값 */
const SERIES_PRESSED_OPACITY = 0.5;

const styles = StyleSheet.create({
  root: {
    gap: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  label: {
    // 라벨·값 행은 줄바꿈을 허용하고 폰트를 축소하지 않는다(uiux 7장 — 동적 텍스트 200%).
    // 최소 폭은 렌더에서 준다(위 labelWidth — 가장 긴 라벨에 맞춘다)
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  value: {
    flex: 1,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  seriesButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  seriesPressed: {
    opacity: SERIES_PRESSED_OPACITY,
  },
  // 셰브론이 줄 끝에 붙지 않고 글자 바로 뒤에 오게 글자는 늘지 않고 줄어들기만 한다(긴 제목은 줄바꿈)
  seriesValue: {
    flexShrink: 1,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
});
