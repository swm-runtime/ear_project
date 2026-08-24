import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from '@/shared/theme';

import { EXPLORE_COPY } from '../explore.copy';

interface SearchInputRowProps {
  value: string;
  onChangeText: (text: string) => void;
  /** 키보드 [검색] 제출 — 디바운스를 기다리지 않고 즉시 실행한다(explore.md 4.5-2) */
  onSubmit: () => void;
  /** [취소] — 피드로 복귀. 검색 상태는 버려진다(explore.md 4.5-1) */
  onCancel: () => void;
}

/**
 * 검색 화면(E6)의 입력 줄 — 검색창이 입력 상태로 그 줄을 다 쓰고 잔여 재생 표시는 없다
 * (explore.md 4.4-1). 진입과 동시에 키보드를 올린다(autoFocus — uiux 7).
 */
export default function SearchInputRow({
  value,
  onChangeText,
  onSubmit,
  onCancel,
}: SearchInputRowProps) {
  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={EXPLORE_COPY.search.placeholder}
        placeholderTextColor={theme.color.textSecondary}
        autoFocus
        returnKeyType="search"
        autoCorrect={false}
        accessibilityRole="search"
        accessibilityLabel={EXPLORE_COPY.search.placeholder}
      />
      <Pressable
        onPress={onCancel}
        style={styles.cancelButton}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.search.cancel}
      >
        <Text style={styles.cancelLabel}>{EXPLORE_COPY.search.cancel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight - theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 0,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  cancelButton: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  cancelLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
});
