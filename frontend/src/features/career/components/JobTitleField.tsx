import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import CloseIcon from '@/shared/ui/CloseIcon';
import { TextInput } from '@/shared/ui/Typography';

import { JOB_TITLE_MAX_LENGTH } from '../career.constants';

interface JobTitleFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** 낭독용 — 화면의 필드 라벨("직무")과 같은 문자열 */
  accessibilityLabel: string;
  /** 지우기 버튼 낭독 — "직무 지우기" */
  clearAccessibilityLabel: string;
  disabled?: boolean;
}

/** 지우기 원 · 그 안 × 크기 */
const CLEAR_DISC_SIZE = 18;
const CLEAR_ICON_SIZE = 9;

/**
 * 직무 입력칸 — 커리어 정보(CR)와 온보딩 2/2(O4)가 같은 부품을 쓴다(PM 2026-10-11). **테두리 없는 면 알약**(PM 2026-10-10
 * "직무 텍스트박스도 알약으로") — 연차 트랙과 같은 연회색 면. 입력 중엔 면을 살짝 짙게, 글자가 있으면 오른쪽 지우기
 * (iOS 기본 동작 — Android 엔 기본 지우기가 없어 직접 그린다). 상한(100자)에서 추가 입력을 받지 않고 카운터·에러 문구는 두지
 * 않는다(career-uiux.md 4.4).
 */
export default function JobTitleField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  clearAccessibilityLabel,
  disabled = false,
}: JobTitleFieldProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.field, isFocused && styles.fieldFocused]}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        editable={!disabled}
        placeholder={placeholder}
        placeholderTextColor={theme.color.textSecondary}
        maxLength={JOB_TITLE_MAX_LENGTH}
        returnKeyType="done"
        clearButtonMode="never"
        accessibilityLabel={accessibilityLabel}
      />
      {value.length > 0 && !disabled ? (
        <Pressable
          style={styles.clearButton}
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={clearAccessibilityLabel}
        >
          <View style={styles.clearDisc}>
            <CloseIcon size={CLEAR_ICON_SIZE} color={theme.color.onPrimary} strokeWidth={2.6} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // 면 입력칸 — 연차 트랙과 같은 surface, 테두리 없음. 높이는 연차 줄과 같은 44, 모양도 같은 **알약**(PM 2026-10-10
  // "직무 텍스트박스도 알약으로" — 종전 md 12). 둥근 끝(22)에 글자가 붙지 않게 시작 여백을 lg 로
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.touchTarget.minHeight,
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
    paddingLeft: theme.spacing.lg,
  },
  // 입력 중 — 테두리 대신 면만 한 단계 짙게(지금 여기를 쓰고 있다)
  fieldFocused: {
    backgroundColor: theme.color.border,
  },
  input: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight,
    paddingRight: theme.spacing.md,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  clearButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // iOS 기본 지우기와 같은 회색 원 + 흰 ×
  clearDisc: {
    width: CLEAR_DISC_SIZE,
    height: CLEAR_DISC_SIZE,
    borderRadius: CLEAR_DISC_SIZE / 2,
    backgroundColor: theme.color.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
