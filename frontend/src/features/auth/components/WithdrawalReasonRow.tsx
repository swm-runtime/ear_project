import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';
import { Text } from '@/shared/ui/Typography';

interface WithdrawalReasonRowProps {
  label: string;
  isSelected: boolean;
  isDisabled?: boolean;
  onPress: () => void;
}

/** 오른쪽 체크마크 — 설정 음질 선택 목록과 같은 크기 */
const CHECK_SIZE = 18;

/**
 * 탈퇴 사유 선택지 한 줄 — **그룹 안의 선택 목록 행**(iOS 설정의 단일 선택 목록 문법, 2026-10-10).
 * 종전 칩(flexWrap 알약)은 긴 문장 선택지가 두 줄로 접혀 폭이 들쭉날쭉했다. 행으로 두면 문장이 왼쪽 선에
 * 정렬되고 선택은 오른쪽 체크마크로만 말한다. 선택된 행을 다시 탭하면 해제된다(사유는 선택 입력 — 훅이 소유).
 */
export default function WithdrawalReasonRow({
  label,
  isSelected,
  isDisabled = false,
  onPress,
}: WithdrawalReasonRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && !isDisabled && styles.pressed]}
      disabled={isDisabled}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected, disabled: isDisabled }}
      accessibilityLabel={label}
    >
      <Text style={styles.label}>{label}</Text>
      {/* 자리는 항상 잡아 둔다 — 선택이 바뀔 때 라벨 폭이 흔들리지 않게 */}
      <View style={styles.check} accessibilityElementsHidden importantForAccessibility="no">
        {isSelected ? <CheckIcon size={CHECK_SIZE} color={theme.color.primary} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm + theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  pressed: {
    backgroundColor: theme.color.border,
  },
  label: {
    flex: 1,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
    lineHeight: 22,
  },
  check: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
