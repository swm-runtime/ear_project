import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { theme } from '@/shared/theme';
import { useWalkthroughStore } from '@/shared/ui/walkthrough.store';

import { EXPLORE_COPY } from '../explore.copy';

/** 가려막의 어둡기 — 아래 화면이 비쳐야 "이 화면의 안내"로 읽힌다 */
const SCRIM = 'rgba(0,0,0,0.72)';
/** 뚫은 구멍의 여백·모서리 */
const HOLE_PAD = 6;
const HOLE_RADIUS = 12;

/**
 * 첫 사용 코치마크 — 온보딩 직후 착지한 **실제 탐색 화면 위**에 얹는다.
 *
 * 단계를 넘기지 않고 **한 화면에 모두 보여준다**(2026-09-06 개편). 단계식은 [다음]을
 * 누르는 동안 앞 설명이 사라져 화면 전체의 구조가 안 잡힌다. 가리키는 곳을 한꺼번에
 * 밝히면 "무엇이 어디에 있는가"가 한 번에 들어온다.
 *
 * 가려막에 구멍을 뚫어 대상만 밝게 남기고(SVG 마스크), 점선 화살표로 설명을 잇는다.
 * 좌표는 화면 크기와 안전영역에서 계산한다 — 실제 요소를 측정하지 않으므로 레이아웃이
 * 크게 바뀌면 여기 상수를 함께 고쳐야 한다.
 *
 * 신호(useWalkthroughStore.pending)는 온보딩 종료가 세우고 여기서 소비한다.
 * 문서 반영 요청: changes/pending/onboarding-o1-visual-refresh.md
 */
export default function ExploreWalkthrough() {
  const pending = useWalkthroughStore((s) => s.pending);
  const clear = useWalkthroughStore((s) => s.clear);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  if (!pending) return null;

  // 밝힐 영역 — 실제 화면의 요소 자리에 맞춘 근사값이다
  const searchBox = {
    x: theme.spacing.lg,
    y: insets.top + theme.spacing.sm,
    w: width - theme.spacing.lg * 2 - 64,
    h: 44,
  };
  const limitBadge = { x: width - theme.spacing.lg - 56, y: insets.top + theme.spacing.sm, w: 56, h: 44 };
  const tabBarTop = height - insets.bottom - 60;
  const libraryTab = { x: 0, y: tabBarTop, w: width / 3, h: 60 };

  /** 둥근 사각형 한 조각 — 바깥 사각형과 함께 evenodd 로 채우면 이 자리가 뚫린다 */
  const hole = (r: { x: number; y: number; w: number; h: number }): string => {
    const x = r.x - HOLE_PAD;
    const y = r.y - HOLE_PAD;
    const w = r.w + HOLE_PAD * 2;
    const h = r.h + HOLE_PAD * 2;
    const rad = Math.min(HOLE_RADIUS, w / 2, h / 2);
    return (
      `M ${x + rad} ${y} H ${x + w - rad} A ${rad} ${rad} 0 0 1 ${x + w} ${y + rad}` +
      ` V ${y + h - rad} A ${rad} ${rad} 0 0 1 ${x + w - rad} ${y + h}` +
      ` H ${x + rad} A ${rad} ${rad} 0 0 1 ${x} ${y + h - rad}` +
      ` V ${y + rad} A ${rad} ${rad} 0 0 1 ${x + rad} ${y} Z`
    );
  };

  // 바깥 사각형 + 구멍들. fillRule="evenodd" 라 겹친 자리가 비워진다 —
  // Mask 를 쓰지 않는 이유는 web(react-native-web)에서 렌더가 어긋나기 때문이다
  const scrimPath =
    `M 0 0 H ${width} V ${height} H 0 Z ` +
    [searchBox, limitBadge, libraryTab].map(hole).join(' ');

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      {/* 가려막 + 구멍 — 마스크의 검은 영역이 뚫린다 */}
      <Svg
        style={StyleSheet.absoluteFill}
        width={width}
        height={height}
        pointerEvents="none"
      >
        <Path d={scrimPath} fill={SCRIM} fillRule="evenodd" />

        {/* 점선 화살표 — 설명에서 대상으로 잇는다 */}
        <Path
          d={`M ${width / 2 - 20} ${searchBox.y + 130} C ${width / 2 - 60} ${searchBox.y + 90}, ${searchBox.x + 60} ${searchBox.y + 90}, ${searchBox.x + 40} ${searchBox.y + searchBox.h + 14}`}
          stroke={theme.color.onPrimary}
          strokeWidth={2}
          strokeDasharray="5 6"
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d={`M ${width - theme.spacing.lg - 40} ${limitBadge.y + 96} C ${width - 60} ${limitBadge.y + 70}, ${width - 44} ${limitBadge.y + 70}, ${limitBadge.x + limitBadge.w / 2} ${limitBadge.y + limitBadge.h + 14}`}
          stroke={theme.color.onPrimary}
          strokeWidth={2}
          strokeDasharray="5 6"
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d={`M ${width / 4} ${tabBarTop - 148} C ${width / 4 - 10} ${tabBarTop - 90}, ${libraryTab.x + libraryTab.w / 2} ${tabBarTop - 50}, ${libraryTab.x + libraryTab.w / 2} ${tabBarTop - 14}`}
          stroke={theme.color.onPrimary}
          strokeWidth={2}
          strokeDasharray="5 6"
          strokeLinecap="round"
          fill="none"
        />
      </Svg>

      {/* 설명 — 화살표가 닿는 자리에 둔다 */}
      <Text style={[styles.note, { top: searchBox.y + 132, left: theme.spacing.lg }]}>
        {EXPLORE_COPY.walkthrough.searchStep}
      </Text>
      <Text style={[styles.note, styles.noteRight, { top: limitBadge.y + 98, right: theme.spacing.lg }]}>
        {EXPLORE_COPY.walkthrough.limitStep}
      </Text>
      <Text style={[styles.note, { top: tabBarTop - 168, left: theme.spacing.lg }]}>
        {EXPLORE_COPY.walkthrough.libraryStep}
      </Text>

      {/* 어디를 눌러도 닫힌다 — 안내는 한 번 읽히면 끝이다. 버튼은 그 사실을 알리는 몫 */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={clear}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.walkthrough.done}
      />
      <View style={[styles.dock, { bottom: insets.bottom + 88 }]} pointerEvents="none">
        <Text style={styles.dockLabel}>{EXPLORE_COPY.walkthrough.done}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** 손으로 적어 둔 메모처럼 — 말풍선을 씌우지 않아야 화면이 가려지지 않는다 */
  note: {
    position: 'absolute',
    maxWidth: '62%',
    color: theme.color.onPrimary,
    fontSize: theme.font.size.md,
    fontWeight: '700',
    lineHeight: theme.font.size.md * 1.45,
  },
  noteRight: {
    textAlign: 'right',
  },
  dock: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm + theme.spacing.xs,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.onPrimary,
  },
  dockLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
});
