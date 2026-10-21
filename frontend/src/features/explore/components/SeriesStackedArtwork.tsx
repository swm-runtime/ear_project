import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { theme } from '@/shared/theme';
import RemoteImage from '@/shared/ui/RemoteImage';

/** 뒤 카드 한 장이 표지 위로 비져 나오는 높이 — 두 장이라 표지 위 여백은 이 값의 두 배 */
export const SERIES_STACK_STEP = 4;
/** 표지 위 여백 전체(뒤 카드 두 장). 자리 전체 높이에서 이만큼 표지가 낮아진다 */
export const SERIES_STACK_HEIGHT = SERIES_STACK_STEP * 2;

/**
 * 뒤 카드의 불투명도 — 가까운 장이 진하고 먼 장이 옅다(깊이 단서). 검은 막이 아니라 반투명이라 화면 바탕에 섞인다 — 밝은 화면에선
 * 옅게, 어두운 화면에선 어둡게(재생목록 묶음과 같은 처리). 어두운 표지에 검은 막을 덮으면 두 장이 다 검게 뭉쳤다(2026-10-22 미리보기)
 */
const NEAR_OPACITY = 0.6;
const FAR_OPACITY = 0.35;

interface SeriesStackedArtworkProps {
  uri: string;
  recyclingKey: string;
  /** 자리 전체(뒤 카드 + 표지)의 크기. 표지는 위 `SERIES_STACK_HEIGHT` 를 뺀 나머지를 채운다 */
  style: StyleProp<ViewStyle>;
  /** 표지 모서리 — 뒤 카드도 같은 곡률을 쓴다 */
  radius: number;
  /** 뒤 카드가 표지보다 한쪽에서 좁아지는 폭(가까운 장). 먼 장은 두 배 */
  inset: number;
  fadeInMs?: number;
  /** 표지 위에 얹는 층(아래 변 "시리즈" 표식) */
  children?: ReactNode;
}

/**
 * 시리즈 표지 — **표지 뒤로 카드 두 장이 겹쳐 위로 비져 나온다**(재생목록 묶음 문법, PM 2026-10-22 "뒤에 박스가 여러 개 보이는
 * 디자인"). 뒤 카드는 같은 표지 그림을 반투명하게 깔아 표지에서 색을 따 오고, 위로 갈수록 좁고 옅다.
 *
 * - **자리 전체 크기는 단일 편 타일과 같다** — 뒤 카드 몫(`SERIES_STACK_HEIGHT`)만큼 표지를 낮춘다. 같은 줄의 콘텐츠 타일과
 *   위·아래 변이 맞는다(explore-uiux.md 4.11)
 * - 흐림(blurRadius)은 쓰지 않는다 — Android expo-image 흐림 동시 사용 크래시(EAR-APP-F)
 * - 장식이라 낭독·터치에서 뺀다. 카드 낭독 라벨이 이미 "시리즈"를 말한다
 */
export default function SeriesStackedArtwork({
  uri,
  recyclingKey,
  style,
  radius,
  inset,
  fadeInMs,
  children,
}: SeriesStackedArtworkProps) {
  return (
    <View style={[style, styles.root]}>
      <SeriesStackLayers uri={uri} recyclingKey={recyclingKey} radius={radius} inset={inset} />
      <View style={[styles.artwork, { borderRadius: radius }]}>
        <RemoteImage
          uri={uri}
          recyclingKey={recyclingKey}
          style={styles.fill}
          fadeInMs={fadeInMs}
        />
        {children}
      </View>
    </View>
  );
}

/**
 * 뒤 카드 두 장만 — 부모를 꽉 채우는 절대 배치 층. 부모는 위에 `SERIES_STACK_HEIGHT` 여백을 두고, 그 아래를 불투명한 표지(또는
 * 카드)가 덮어야 한다. 인기 대표 카드처럼 카드가 표지를 클립하는 자리는 이것을 카드 바깥에 둔다
 */
export function SeriesStackLayers({
  uri,
  recyclingKey,
  radius,
  inset,
}: {
  uri: string;
  recyclingKey: string;
  radius: number;
  inset: number;
}) {
  const shape = { borderRadius: radius, borderCurve: 'continuous' as const };
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* 먼 장(맨 위) → 가까운 장 순서로 그려 가까운 장이 위에 앉는다 */}
      <StackLayer
        uri={uri}
        recyclingKey={recyclingKey}
        style={[shape, { top: 0, left: inset * 2, right: inset * 2 }]}
        opacity={FAR_OPACITY}
      />
      <StackLayer
        uri={uri}
        recyclingKey={recyclingKey}
        style={[shape, { top: SERIES_STACK_STEP, left: inset, right: inset }]}
        opacity={NEAR_OPACITY}
      />
    </View>
  );
}

function StackLayer({
  uri,
  recyclingKey,
  style,
  opacity,
}: {
  uri: string;
  recyclingKey: string;
  style: StyleProp<ViewStyle>;
  opacity: number;
}) {
  return (
    <View style={[styles.layer, style, { opacity }]}>
      <RemoteImage uri={uri} recyclingKey={recyclingKey} style={styles.fill} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: SERIES_STACK_HEIGHT,
  },
  artwork: {
    flex: 1,
    backgroundColor: theme.color.surface,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  // 뒤 카드는 표지 높이만큼 내려가 표지에 가려진다 — 위 변만 비져 나온다
  layer: {
    position: 'absolute',
    bottom: 0,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
});
