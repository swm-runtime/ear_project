import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';

interface WithdrawalCheckRowProps {
  label: string;
  isChecked: boolean;
  /** 서버가 이 체크의 누락으로 요청을 거절했을 때 강조한다(common-error-handling.md 9.3) */
  isHighlighted?: boolean;
  isDisabled?: boolean;
  onToggle: () => void;
}

/**
 * 탈퇴 화면의 확인 체크 행(A7의 만료 동의·최종 확인).
 * 동의 화면의 ConsentItem과 분리한 이유: 저쪽은 필수/선택 태그와 [보기] 문서 열람이
 * 있는 약관 행이고, 이쪽은 태그도 문서도 없는 대신 **서버 거절 시 강조** 상태를 갖는다.
 */
export default function WithdrawalCheckRow({
  label,
  isChecked,
  isHighlighted = false,
  isDisabled = false,
  onToggle,
}: WithdrawalCheckRowProps) {
  return (
    <Pressable
      style={[styles.container, isHighlighted && styles.containerHighlighted]}
      disabled={isDisabled}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isChecked, disabled: isDisabled }}
      accessibilityLabel={label}
    >
      <View style={[styles.box, isChecked && styles.boxChecked]}>
        {isChecked ? <CheckIcon size={13} color={theme.color.onPrimary} /> : null}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    // 두 줄 라벨에서 체크가 줄 사이에 뜨지 않게 첫 줄에 맞춘다
    alignItems: 'flex-start',
    minHeight: theme.touchTarget.minHeight,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    // 평소에는 테두리를 드러내지 않는다 — 강조 시에만 색이 붙게 폭만 잡아 둔다
    borderColor: 'transparent',
  },
  containerHighlighted: {
    borderColor: theme.color.danger,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.sm - 2,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm + theme.spacing.xs,
  },
  boxChecked: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
  label: {
    flex: 1,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
    lineHeight: 22,
  },
});
