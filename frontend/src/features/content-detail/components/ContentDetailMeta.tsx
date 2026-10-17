import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { theme } from '@/shared/theme';
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
export default function ContentDetailMeta({ content }: ContentDetailMetaProps) {
  const [labelWidth, setLabelWidth] = useState(LABEL_MIN_WIDTH);
  const handleLabelLayout = (event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width);
    setLabelWidth((current) => (width > current ? width : current));
  };
  const labelStyle = [styles.label, { minWidth: labelWidth }];

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
          <Text style={styles.value}>{formatSeriesLabel(content.series)}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** 라벨 열의 바닥 폭 — 실측한 최대 라벨 폭이 이보다 크면 그 값을 쓴다 */
const LABEL_MIN_WIDTH = 56;

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
});
