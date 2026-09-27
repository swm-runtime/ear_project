import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import CloseIcon from '@/shared/ui/CloseIcon';
import GlassCapsule, { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';

import { RemainingPlaysIndicator } from '@/features/player';

import { EXPLORE_COPY } from '../explore.copy';

interface SearchToolbarProps {
  /** null 이면 링 칸을 두지 않는다(무제한·캐시·값 없음 — uiux 4.3) — 그땐 닫기 원만 남는다 */
  remaining: { remaining: number; limit: number } | null;
  onExhaustedPress: () => void;
  onClose: () => void;
}

/**
 * 제자리 검색의 제목 줄 오른쪽 — 잔여 링 + 닫기(✕)를 **한 유리 캡슐**에 묶는다(PM 2026-09-27 22:53 "두 알약 합쳐").
 * 라이브러리 툴바(링 + 필터, LibraryToolbar)와 같은 문법 — 칸 44, 사이 hairline 구분선
 */
export default function SearchToolbar({ remaining, onExhaustedPress, onClose }: SearchToolbarProps) {
  return (
    <GlassCapsule style={styles.capsule}>
      {remaining ? (
        <>
          <View style={styles.cell}>
            <RemainingPlaysIndicator
              remaining={remaining.remaining}
              limit={remaining.limit}
              onExhaustedPress={onExhaustedPress}
              bare
            />
          </View>
          <View style={styles.divider} pointerEvents="none" />
        </>
      ) : null}
      <Pressable
        style={styles.cell}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.search.cancel}
      >
        <CloseIcon size={16} color={theme.color.textPrimary} />
      </Pressable>
    </GlassCapsule>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_CONTROL_HEIGHT,
  },
  cell: {
    width: theme.touchTarget.minWidth,
    height: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: HEADER_CONTROL_HEIGHT - theme.spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
});
