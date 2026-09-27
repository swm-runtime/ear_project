import { Pressable, StyleSheet } from 'react-native';

import { theme } from '@/shared/theme';
import CloseIcon from '@/shared/ui/CloseIcon';
import GlassCapsule, { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';

interface GlassCloseButtonProps {
  onPress: () => void;
  accessibilityLabel: string;
}

/**
 * iOS 26 닫기 — 유리 원 안의 ✕(40pt, 머리 줄 컨트롤과 같은 높이). 글자 "취소" 대신 쓴다(PM 2026-09-27 22:14)
 */
export default function GlassCloseButton({ onPress, accessibilityLabel }: GlassCloseButtonProps) {
  return (
    <GlassCapsule style={styles.circle}>
      <Pressable
        style={styles.pressable}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={4}
      >
        <CloseIcon size={16} color={theme.color.textPrimary} />
      </Pressable>
    </GlassCapsule>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: HEADER_CONTROL_HEIGHT,
    height: HEADER_CONTROL_HEIGHT,
  },
  pressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
