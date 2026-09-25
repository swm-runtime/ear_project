import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from '@/shared/theme';
import { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';

import { EXPLORE_COPY } from '../explore.copy';

interface SearchInputRowProps {
  value: string;
  onChangeText: (text: string) => void;
  /** 키보드 [검색] 제출 — 디바운스를 기다리지 않고 즉시 실행한다(explore.md 4.5-2) */
  onSubmit: () => void;
  /** [취소] — 피드로 복귀. 검색 상태는 버려진다(explore.md 4.5-1) */
  onCancel?: () => void;
  /** `fill` — 콘텐츠 안 검색 필드(검색 탭, 애플 뮤직 검색창처럼 면). 기본은 종전 입력 상자 */
  variant?: 'default' | 'fill';
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
  variant = 'default',
}: SearchInputRowProps) {
  return (
    <View style={styles.row}>
      <TextInput
        style={[styles.input, variant === 'fill' && styles.inputFill]}
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
      {onCancel ? (
        <Pressable
          onPress={onCancel}
          style={styles.cancelButton}
          accessibilityRole="button"
          accessibilityLabel={EXPLORE_COPY.search.cancel}
        >
          <Text style={styles.cancelLabel}>{EXPLORE_COPY.search.cancel}</Text>
        </Pressable>
      ) : null}
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
    // 애플 검색 필드와 같은 연속 곡률(iOS 만, 2026-09-22 PM)
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  // 콘텐츠 안 검색 필드(검색 탭) — 라이브러리의 채움 검색 캡슐과 같은 모양(full, 40)
  inputFill: {
    minHeight: HEADER_CONTROL_HEIGHT,
    borderRadius: theme.radius.full,
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
