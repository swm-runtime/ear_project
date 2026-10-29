import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import InsetGroup from '@/shared/ui/InsetGroup';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text, TextInput } from '@/shared/ui/Typography';

import { INVITE_CODE_MAX_LENGTH, useInviteCodeForm } from '../hooks/useInviteCodeForm';
import { SUBSCRIPTION_COPY } from '../subscription.copy';
import type { MySubscription } from '../subscription.types';

const COPY = SUBSCRIPTION_COPY.invite;

interface InviteCodeFormProps {
  /** 그룹 위 제목 — S12 의 "프로모션 코드" 섹션 */
  title?: string;
  /** 적용 성공 — 응답 본문(구독 조회와 같은 본문). 화면이 이용 중 섹션을 다시 받는다 */
  onApplied?: (subscription: MySubscription) => void;
}

/**
 * 프로모션 코드 입력 칸(KAN-182 — settings-uiux.md 4.8 S12 "코드 입력" 섹션). 종전 단독 화면(프로모션 코드 입력)을 S12 프로모션
 * 화면(KAN-280)의 한 섹션으로 옮겼다 — **동작은 그대로다**(즉시 적용, 유료 구독 중 확인, 서버 문구). 화면은 content-review 가 소유한다.
 *
 * 인셋 그룹 하나에 입력 한 칸, 그 밑 [확인]. 실패하면 입력값을 그대로 두고 문구만 보인다
 */
export default function InviteCodeForm({ title, onApplied }: InviteCodeFormProps) {
  const form = useInviteCodeForm({ onApplied });

  return (
    <View style={styles.root}>
      <InsetGroup title={title} footer={COPY.description}>
        <TextInput
          style={styles.input}
          value={form.code}
          onChangeText={form.changeCode}
          placeholder={COPY.placeholder}
          placeholderTextColor={theme.color.textMuted}
          // 대소문자·공백은 서버가 정규화한다 — 키보드가 첫 글자를 바꾸거나 고치지 않게만 둔다
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={INVITE_CODE_MAX_LENGTH}
          returnKeyType="done"
          onSubmitEditing={form.submit}
          editable={!form.isSubmitting}
          accessibilityLabel={COPY.inputA11y}
        />
      </InsetGroup>

      {form.errorMessage !== null ? (
        // 사용자가 시작한 요청의 직접 결과 — assertive(탈퇴 화면과 같다)
        <Text style={styles.error} accessibilityLiveRegion="assertive">
          {form.errorMessage}
        </Text>
      ) : null}

      <Pressable
        style={[
          pillButton.base,
          pillButton.primary,
          styles.submit,
          !form.canSubmit && styles.submitDisabled,
        ]}
        onPress={form.submit}
        disabled={!form.canSubmit}
        accessibilityRole="button"
        accessibilityLabel={form.isSubmitting ? COPY.submitting : COPY.submit}
        accessibilityState={{ disabled: !form.canSubmit, busy: form.isSubmitting }}
      >
        {form.isSubmitting ? (
          <ActivityIndicator color={theme.color.onPrimary} />
        ) : (
          <Text style={pillButton.primaryLabel}>{COPY.submit}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: theme.spacing.md,
  },
  /** 그룹 면 안의 한 행 — 테두리 없이 면이 곧 입력 칸이다(탈퇴 화면 [기타] 입력과 같은 문법) */
  input: {
    minHeight: theme.touchTarget.minHeight,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + theme.spacing.xs,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  error: {
    marginHorizontal: theme.spacing.md + theme.spacing.md,
    fontSize: theme.font.size.sm,
    color: theme.color.danger,
  },
  submit: {
    marginHorizontal: theme.spacing.md,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  /** 비활성 — 빈 값·처리 중. 검정을 흐리지 않고 회색 면으로 내린다(탈퇴 [탈퇴하기]와 같다) */
  submitDisabled: {
    backgroundColor: theme.color.fillMuted,
  },
});
