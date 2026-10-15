import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';
import { Text } from '@/shared/ui/Typography';

interface LanguageOptionCardProps {
  /** 선택지 이름 — 그 언어 자신의 표기("한국어" · "English") */
  label: string;
  /** 받게 되는 콘텐츠 한 줄(표시 언어) */
  description: string;
  isSelected: boolean;
  onPress: () => void;
}

/**
 * A21 콘텐츠 언어 선택지 한 장 — 크게 누르는 카드(면 = 둥근 사각, design.md §2).
 * 선택은 테두리 색만이 아니라 **채운 원 + 체크 도형**으로도 말한다(색만으로 상태를 구분하지 않는다 — auth-uiux.md 7).
 * 원 모양은 A4 약관 동의의 체크와 같다.
 */
export default function LanguageOptionCard({
  label,
  description,
  isSelected,
  onPress,
}: LanguageOptionCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        isSelected && styles.cardSelected,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={label}
      accessibilityHint={description}
    >
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <View
        style={[styles.circle, isSelected && styles.circleChecked]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {isSelected ? <CheckIcon size={15} color={theme.color.onPrimary} /> : null}
      </View>
    </Pressable>
  );
}

const BORDER_WIDTH = 2;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.touchTarget.minHeight * 2,
    paddingHorizontal: theme.spacing.md + theme.spacing.xs,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
    // 선택 전에도 같은 두께를 잡아 둔다 — 선택될 때 카드 크기가 흔들리지 않게
    borderWidth: BORDER_WIDTH,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: theme.color.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  texts: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  label: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  description: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.sm * 1.4,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleChecked: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
});
