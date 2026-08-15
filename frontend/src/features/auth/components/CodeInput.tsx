import { useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

import { theme } from '@/shared/theme';

import { EMAIL_CODE_LENGTH } from '../auth.constants';
import { AUTH_COPY } from '../auth.copy';

interface CodeInputProps {
  /** 숫자만 담긴 문자열(최대 6자리) — 상태 소유는 훅이다 */
  value: string;
  onChange: (value: string) => void;
  /** 만료·시도 소진이면 입력을 비활성화한다(auth-uiux.md 4.12·4.13) */
  editable: boolean;
}

/**
 * 6칸 분리 코드 입력(auth-uiux.md 4.10) — 숫자 전용 키보드, 자동 포커스 이동,
 * 빈 칸 백스페이스 시 이전 칸으로. 붙여넣기는 어느 칸에서든 6자리가 한 번에 채워진다.
 * 각 칸이 실제 TextInput이라 낭독기가 "인증 코드 N번째 자리"로 칸 단위로 읽는다(7장).
 */
export default function CodeInput({ value, onChange, editable }: CodeInputProps) {
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const applyValue = (next: string): void => {
    const digits = next.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
    onChange(digits);
    if (digits.length >= EMAIL_CODE_LENGTH) {
      inputRefs.current[EMAIL_CODE_LENGTH - 1]?.blur();
    } else {
      inputRefs.current[digits.length]?.focus();
    }
  };

  const handleChange = (index: number, text: string): void => {
    if (text === '') {
      // 지움 — 이 칸부터 뒤를 비운다. 중간만 비면 커서 위치와 값이 어긋난다
      applyValue(value.slice(0, index));
      return;
    }
    // 입력·붙여넣기 — 이 칸 위치에 이어 붙인다(첫 칸 붙여넣기가 6칸을 채우는 경로)
    applyValue(value.slice(0, index) + text);
  };

  const handleKeyPress = (
    index: number,
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ): void => {
    if (event.nativeEvent.key === 'Backspace' && value[index] === undefined && index > 0) {
      applyValue(value.slice(0, index - 1));
    }
  };

  return (
    <View style={styles.row}>
      {Array.from({ length: EMAIL_CODE_LENGTH }, (_, index) => (
        <TextInput
          key={index}
          ref={(ref) => {
            inputRefs.current[index] = ref;
          }}
          style={[
            styles.cell,
            value[index] !== undefined && styles.cellFilled,
            !editable && styles.cellDisabled,
          ]}
          value={value[index] ?? ''}
          onChangeText={(text) => handleChange(index, text)}
          onKeyPress={(event) => handleKeyPress(index, event)}
          editable={editable}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          caretHidden
          accessibilityLabel={AUTH_COPY.email.codeDigitA11y(index + 1)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  cell: {
    // 터치 타깃 44pt 기준(auth-uiux.md 7장)
    width: theme.touchTarget.minWidth,
    height: theme.touchTarget.minHeight + theme.spacing.sm,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    textAlign: 'center',
    fontSize: theme.font.size.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  cellFilled: {
    borderColor: theme.color.textPrimary,
  },
  cellDisabled: {
    backgroundColor: theme.color.surface,
    color: theme.color.textSecondary,
  },
});
