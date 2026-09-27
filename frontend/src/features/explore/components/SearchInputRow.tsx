import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from '@/shared/theme';
import { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import MagnifierIcon, { SEARCH_ICON_SIZE } from '@/shared/ui/MagnifierIcon';

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
      {/* 필드 = 돋보기 + 입력 + 지우기(ⓧ) — iOS 시스템 검색창과 같은 구성(2026-09-27). 면·모서리는 틀이 갖는다 */}
      <View style={[styles.field, variant === 'fill' && styles.fieldFill]}>
        <MagnifierIcon size={SEARCH_ICON_SIZE} color={theme.color.textSecondary} />
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
        {value.length > 0 ? (
          <Pressable
            style={styles.clearButton}
            onPress={() => onChangeText('')}
            accessibilityRole="button"
            accessibilityLabel={EXPLORE_COPY.search.clearA11y}
            hitSlop={8}
          >
            <View style={styles.clearCircle}>
              <Text style={styles.clearGlyph}>✕</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
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
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs + 2,
    minHeight: theme.touchTarget.minHeight - theme.spacing.xs,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.xs,
    borderRadius: theme.radius.md,
    // 애플 검색 필드와 같은 연속 곡률(iOS 만, 2026-09-22 PM)
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
  },
  // 콘텐츠 안 검색 필드(검색 탭) — 라이브러리의 채움 검색 캡슐과 같은 모양(full, 40)
  fieldFill: {
    minHeight: HEADER_CONTROL_HEIGHT,
    borderRadius: theme.radius.full,
  },
  input: {
    flex: 1,
    paddingVertical: 0,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  clearButton: {
    paddingHorizontal: theme.spacing.xs,
    justifyContent: 'center',
  },
  // iOS 지우기 버튼 — 회색 원 안의 흰 ✕
  clearCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.textSecondary,
  },
  clearGlyph: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.color.background,
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
