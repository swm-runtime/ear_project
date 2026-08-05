import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { ONBOARDING_COPY } from '../onboarding.copy';

interface ReconsiderDialogProps {
  isVisible: boolean;
  onAllowPress: () => void;
  onDeclinePress: () => void;
  /** Android 하드웨어 뒤로가기 — 팝업만 닫고 사전 안내 화면에 머문다(onboarding.md 7) */
  onCloseRequest: () => void;
}

/**
 * O11 알림 재고 팝업(onboarding-uiux.md 4.8).
 * - 두 버튼은 같은 행·같은 크기·같은 시각적 무게 — [괜찮아요]를 작게 만들면 다크패턴이다.
 * - 배경 딤 탭으로 닫히지 않는다. 한 번뿐인 노출이 의도 없는 탭으로 소모되면 안 된다.
 */
export default function ReconsiderDialog({
  isVisible,
  onAllowPress,
  onDeclinePress,
  onCloseRequest,
}: ReconsiderDialogProps) {
  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onCloseRequest}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <Text style={styles.title}>{ONBOARDING_COPY.reconsider.title}</Text>
          <Text style={styles.question}>{ONBOARDING_COPY.reconsider.question}</Text>
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.declineButton]}
              onPress={onDeclinePress}
              accessibilityRole="button"
              accessibilityLabel={ONBOARDING_COPY.reconsider.decline}
            >
              <Text style={styles.declineLabel}>{ONBOARDING_COPY.reconsider.decline}</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.allowButton]}
              onPress={onAllowPress}
              accessibilityRole="button"
              accessibilityLabel={ONBOARDING_COPY.reconsider.allow}
            >
              <Text style={styles.allowLabel}>{ONBOARDING_COPY.reconsider.allow}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.color.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  dialog: {
    alignSelf: 'stretch',
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.background,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.md * 1.4,
  },
  question: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  // 두 버튼 동등 비중 — flex 1 + 같은 높이(onboarding-uiux.md 4.8)
  button: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    borderWidth: 1.5,
    borderColor: theme.color.primary,
  },
  declineLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.primary,
  },
  allowButton: {
    backgroundColor: theme.color.primary,
  },
  allowLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
