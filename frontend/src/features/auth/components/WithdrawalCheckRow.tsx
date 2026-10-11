import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';
import { Text } from '@/shared/ui/Typography';

interface WithdrawalCheckRowProps {
  label: string;
  isChecked: boolean;
  /** 서버가 이 체크의 누락으로 요청을 거절했을 때 강조한다(common-error-handling.md 9.3) */
  isHighlighted?: boolean;
  isDisabled?: boolean;
  onToggle: () => void;
}

/** 오른쪽 선택 원 — iOS 리마인더·메일 선택 모드의 원형 체크 크기 */
const CIRCLE_SIZE = 24;

/**
 * 탈퇴 화면의 확인 체크 행(A7의 만료 동의·최종 확인) — **인셋 그룹 안의 한 행**이다(2026-10-10 개편).
 * 왼쪽에 네모 체크박스를 두던 종전 모양은 iOS 에 없는 컨트롤이라 그룹 리스트에 앉히면 웹 폼처럼 보였다.
 * 라벨을 행 글자 자리에 두고 **오른쪽 끝에 원형 체크**(리마인더 문법)를 둔다. 행 전체가 탭 영역이다.
 *
 * 동의 화면의 ConsentItem과 분리한 이유: 저쪽은 필수/선택 태그와 [보기] 문서 열람이 있는 약관 행이고,
 * 이쪽은 태그도 문서도 없는 대신 **서버 거절 시 강조** 상태를 갖는다 — 라벨과 원 테두리가 빨강이 된다.
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
      style={({ pressed }) => [styles.row, pressed && !isDisabled && styles.pressed]}
      disabled={isDisabled}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isChecked, disabled: isDisabled }}
      accessibilityLabel={label}
    >
      <Text style={[styles.label, isHighlighted && styles.labelHighlighted]}>{label}</Text>
      <View
        style={[
          styles.circle,
          isChecked && styles.circleChecked,
          isHighlighted && !isChecked && styles.circleHighlighted,
        ]}
      >
        {isChecked ? <CheckIcon size={14} color={theme.color.onPrimary} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 설정 행과 같은 높이(56)·여백 — 한 그룹 안에서 고지 행과 줄이 맞는다
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
  /** 서버 거절 강조 — 색만 바꾸고 크기는 그대로(design.md §1 의미색) */
  labelHighlighted: {
    color: theme.color.danger,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 1.5,
    borderColor: theme.color.textMutedSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleChecked: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
  circleHighlighted: {
    borderColor: theme.color.danger,
  },
});
