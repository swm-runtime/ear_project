import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from '@/shared/theme';
import CloseIcon from '@/shared/ui/CloseIcon';
import GlassCapsule, { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import MagnifierIcon, { SEARCH_ICON_SIZE } from '@/shared/ui/MagnifierIcon';

import { EXPLORE_COPY } from '../explore.copy';

/** 지우기(ⓧ) 자리 폭 — 원 16 + 좌우 여백 4씩. 글자 유무와 무관하게 고정이다 */
const CLEAR_SLOT_WIDTH = 24;

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
        {/*
          지우기(ⓧ) 자리는 **항상 비워 둔다.** 글자가 생길 때 버튼을 새로 끼우면 입력 칸 폭이 그만큼(자리 24 +
          간격 6 = 30) 줄어들며 글자·커서가 밀린다(PM 2026-09-27 22:14 "검색바가 미세하게 이동"). 자리는 고정하고
          보일지만 바꾼다 — 비어 있을 때는 낭독·터치 대상에서도 뺀다
        */}
        <Pressable
          style={styles.clearButton}
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={EXPLORE_COPY.search.clearA11y}
          accessibilityElementsHidden={value.length === 0}
          importantForAccessibility={value.length === 0 ? 'no-hide-descendants' : 'yes'}
          pointerEvents={value.length === 0 ? 'none' : 'auto'}
          hitSlop={8}
        >
          <View style={[styles.clearCircle, value.length === 0 && styles.clearHidden]}>
            <Text style={styles.clearGlyph}>✕</Text>
          </View>
        </Pressable>
      </View>
      {onCancel ? (
        variant === 'fill' ? (
          // iOS 26 검색 닫기 — 글자 "취소" 대신 유리 원 안의 ✕(PM 2026-09-27 22:14). 검색창과 같은 높이 40
          <GlassCapsule style={styles.closeCircle}>
            <Pressable
              style={styles.closePressable}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel={EXPLORE_COPY.search.cancel}
              hitSlop={4}
            >
              <CloseIcon size={16} color={theme.color.textPrimary} />
            </Pressable>
          </GlassCapsule>
        ) : (
          <Pressable
            onPress={onCancel}
            style={styles.cancelButton}
            accessibilityRole="button"
            accessibilityLabel={EXPLORE_COPY.search.cancel}
          >
            <Text style={styles.cancelLabel}>{EXPLORE_COPY.search.cancel}</Text>
          </Pressable>
        )
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
    // 지우기 원의 오른쪽 여백을 돋보기의 왼쪽 여백(16)과 맞춘다 — 12 + 지우기 버튼 안쪽 4 (PM 2026-09-27 22:24 "너무 오른쪽에 붙어")
    paddingRight: theme.spacing.sm + theme.spacing.xs,
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
    // 폭을 고정한다 — 위 주석(입력 칸이 밀리지 않게)
    width: CLEAR_SLOT_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 글자가 없을 때 — 자리는 그대로 두고 보이지만 않게 한다 */
  clearHidden: {
    opacity: 0,
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
  closeCircle: {
    width: HEADER_CONTROL_HEIGHT,
    height: HEADER_CONTROL_HEIGHT,
  },
  closePressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
