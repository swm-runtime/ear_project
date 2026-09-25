import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import GlassSurface from '@/shared/ui/GlassSurface';

import { LIBRARY_COPY } from '../library.copy';
import FilterIcon from './FilterIcon';

const FILTER_ICON_SIZE = 20;
/** 유리 원 버튼 지름 — 잔여 링의 유리 원(36)과 같은 눈높이 */
const FILTER_CIRCLE_SIZE = 36;

interface LibraryFilterButtonProps {
  /** 적용 중인 필터 개수(상태 ≠ 전체 · 출처 · 주제) — 0이면 배지를 그리지 않는다(library-uiux.md 4.2) */
  activeCount: number;
  onPress: () => void;
}

/**
 * 필터 원 버튼 — 검색줄 오른쪽, 잔여 링 옆. 탭하면 L2 필터 시트(상태·출처·주제).
 * 종전에는 세그먼트 탭(전체·미청취·완료) 줄 끝에 있었다 — 2026-09-25 PM "애플이었으면": 같은 목록을 상태로
 * 거르는 건 세그먼트(뷰 전환)가 아니라 **필터 메뉴**(팟캐스트·메일 문법)라 상태를 시트로 옮기고 이 버튼 하나만 남겼다.
 * 유리 원(iOS 26 툴바 버튼처럼, PM 2026-09-23). 배지는 아이콘 위에 얹는다 — 옆에 두면 버튼 폭이 흔들린다
 */
export default function LibraryFilterButton({ activeCount, onPress }: LibraryFilterButtonProps) {
  return (
    <Pressable
      style={styles.button}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        activeCount > 0
          ? LIBRARY_COPY.topicFilter.a11yBadge(activeCount)
          : LIBRARY_COPY.topicFilter.a11yNone
      }
    >
      <View style={styles.circle}>
        <GlassSurface style={[StyleSheet.absoluteFill, styles.glass]} />
        <View style={styles.circleBorder} pointerEvents="none" />
        <FilterIcon
          size={FILTER_ICON_SIZE}
          color={activeCount > 0 ? theme.color.primary : theme.color.textSecondary}
        />
      </View>
      {activeCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{activeCount > 9 ? '9+' : activeCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: FILTER_CIRCLE_SIZE,
    height: FILTER_CIRCLE_SIZE,
    borderRadius: FILTER_CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glass: {
    borderRadius: FILTER_CIRCLE_SIZE / 2,
    overflow: 'hidden',
  },
  circleBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: FILTER_CIRCLE_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.10)',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeLabel: {
    fontSize: theme.font.size.xs,
    color: theme.color.onPrimary,
    fontWeight: '700',
  },
});
