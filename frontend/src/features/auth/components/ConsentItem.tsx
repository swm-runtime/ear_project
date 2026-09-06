import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';
import ChevronIcon from '@/shared/ui/ChevronIcon';

import { AUTH_COPY } from '../auth.copy';

interface ConsentItemProps {
  label: string;
  isRequired: boolean;
  isChecked: boolean;
  /** 마케팅 항목의 수신 내용 한 줄 고지(auth-uiux.md 4.3) */
  description: string | null;
  onToggle: () => void;
  /** 없으면 [보기] 셰브론을 그리지 않는다 — 마케팅처럼 열람 문서가 없는 항목용 */
  onViewPress?: () => void;
}

/**
 * 동의 항목 행 — 빈 원형 체크(체크 시 primary 채움) + 라벨 + [보기] 셰브론(스타벅스 결,
 * 시각 개편 2026-09-04). 행 전체(셰브론 제외)가 탭 영역이고 낭독은 checkbox 시맨틱이다.
 */
export default function ConsentItem({
  label,
  isRequired,
  isChecked,
  description,
  onToggle,
  onViewPress,
}: ConsentItemProps) {
  const tag = isRequired ? AUTH_COPY.consent.requiredTag : AUTH_COPY.consent.optionalTag;

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.checkArea}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isChecked }}
        accessibilityLabel={`${label} ${tag}`}
      >
        <View style={[styles.circle, isChecked && styles.circleChecked]}>
          {isChecked ? <CheckIcon size={13} color={theme.color.onPrimary} /> : null}
        </View>
        <View style={styles.labelArea}>
          <Text style={styles.label}>
            {label} <Text style={styles.tag}>{tag}</Text>
          </Text>
          {description !== null ? <Text style={styles.description}>{description}</Text> : null}
        </View>
      </Pressable>
      {onViewPress ? (
        <Pressable
          style={styles.viewButton}
          onPress={onViewPress}
          hitSlop={theme.spacing.sm}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${AUTH_COPY.consent.view}`}
        >
          <ChevronIcon direction="right" size={18} color={theme.color.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.touchTarget.minHeight,
  },
  checkArea: {
    flex: 1,
    flexDirection: 'row',
    // 원은 첫 줄(라벨)에 맞춘다 — 두 줄 항목에서 원이 줄 사이에 뜨지 않게
    alignItems: 'flex-start',
    minHeight: theme.touchTarget.minHeight,
    paddingVertical: theme.spacing.sm + 3,
  },
  /** 빈 원형 체크 — 체크 시 primary 채움(전체 동의와 같은 문법, 한 치수 작게) */
  circle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm + theme.spacing.xs,
  },
  circleChecked: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
  labelArea: {
    flex: 1,
  },
  label: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
    // 원(22)과 같은 높이의 첫 줄 상자 — flex-start 정렬에서 시각 중심이 일치한다
    lineHeight: 22,
  },
  tag: {
    color: theme.color.textSecondary,
    fontSize: theme.font.size.sm,
  },
  description: {
    marginTop: theme.spacing.xs,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  viewButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
