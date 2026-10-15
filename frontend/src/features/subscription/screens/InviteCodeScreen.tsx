import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { USES_SYSTEM_PUSHED_HEADER } from '@/shared/navigation/pushed-screen-header';
import { useSystemLargeTitle } from '@/shared/navigation/useSystemLargeTitle';
import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import GlassIconButton from '@/shared/ui/GlassIconButton';
import InsetGroup from '@/shared/ui/InsetGroup';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text, TextInput } from '@/shared/ui/Typography';

import { INVITE_CODE_MAX_LENGTH, useInviteCodeScreen } from '../hooks/useInviteCodeScreen';
import { SUBSCRIPTION_COPY } from '../subscription.copy';

const COPY = SUBSCRIPTION_COPY.invite;
const BACK_ICON_SIZE = 20;

/**
 * 이벤트 코드 입력(KAN-182 — settings-uiux.md S12). 설정 > [이벤트 코드 입력]에서 온다.
 * **결제 UI 플래그와 무관하게 항상 있다** — 지급은 스토어 결제가 아니라 서버가 풀어 주는 혜택이다.
 *
 * 화면 문법은 설정의 하위 화면과 같다 — iOS 26 시스템 큰 제목(그 외는 앱바), 본문은 인셋 그룹 하나에 입력 한 칸.
 * [확인]은 키보드에 가리지 않게 입력 바로 밑에 둔다. 실패하면 입력값을 그대로 두고 문구만 보인다
 */
export default function InviteCodeScreen() {
  const screen = useInviteCodeScreen();
  useSystemLargeTitle(COPY.title, null);

  return (
    <SafeAreaView
      style={styles.container}
      edges={USES_SYSTEM_PUSHED_HEADER ? ['bottom'] : undefined}
    >
      {USES_SYSTEM_PUSHED_HEADER ? null : (
        <View style={styles.appBar}>
          <GlassIconButton onPress={screen.goBack} accessibilityLabel={COPY.backA11y}>
            <ChevronIcon direction="left" size={BACK_ICON_SIZE} color={theme.color.textPrimary} />
          </GlassIconButton>
          <Text style={styles.appBarTitle} accessibilityRole="header">
            {COPY.title}
          </Text>
          <View style={styles.appBarSpacer} />
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.body}
        contentInsetAdjustmentBehavior={USES_SYSTEM_PUSHED_HEADER ? 'automatic' : 'never'}
        keyboardShouldPersistTaps="handled"
      >
        <InsetGroup footer={COPY.description}>
          <TextInput
            style={styles.input}
            value={screen.code}
            onChangeText={screen.changeCode}
            placeholder={COPY.placeholder}
            placeholderTextColor={theme.color.textMuted}
            // 대소문자·공백은 서버가 정규화한다 — 키보드가 첫 글자를 바꾸거나 고치지 않게만 둔다
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            maxLength={INVITE_CODE_MAX_LENGTH}
            returnKeyType="done"
            onSubmitEditing={screen.submit}
            editable={!screen.isSubmitting}
            autoFocus
            accessibilityLabel={COPY.inputA11y}
          />
        </InsetGroup>

        {screen.errorMessage !== null ? (
          // 사용자가 시작한 요청의 직접 결과 — assertive(탈퇴 화면과 같다)
          <Text style={styles.error} accessibilityLiveRegion="assertive">
            {screen.errorMessage}
          </Text>
        ) : null}

        <Pressable
          style={[
            pillButton.base,
            pillButton.primary,
            styles.submit,
            !screen.canSubmit && styles.submitDisabled,
          ]}
          onPress={screen.submit}
          disabled={!screen.canSubmit}
          accessibilityRole="button"
          accessibilityLabel={screen.isSubmitting ? COPY.submitting : COPY.submit}
          accessibilityState={{ disabled: !screen.canSubmit, busy: screen.isSubmitting }}
        >
          {screen.isSubmitting ? (
            <ActivityIndicator color={theme.color.onPrimary} />
          ) : (
            <Text style={pillButton.primaryLabel}>{COPY.submit}</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  appBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  /** 타이틀을 가운데 두기 위한 뒤로가기 대칭 여백 */
  appBarSpacer: {
    minWidth: HEADER_CONTROL_HEIGHT,
  },
  body: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
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
