import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

interface DialogAction {
  label: string;
  onPress: () => void;
}

interface CareerDialogProps {
  isVisible: boolean;
  title: string;
  /** 왼쪽 보조 액션([계속 편집]) — 안전한 쪽이 보조다 */
  secondaryAction: DialogAction;
  /** 오른쪽 주 액션([나가기]) — 위험색으로 그리지 않는다(interest IM7과 동일) */
  primaryAction: DialogAction;
  /** Android 하드웨어 백 — 보조 액션과 같다(팝업만 닫고 편집 유지) */
  onCloseRequest: () => void;
}

/**
 * CR5 이탈 확인 다이얼로그. **딤 영역 탭으로는 닫히지 않는다**(career-uiux.md 4.6 —
 * 파괴적 결과가 걸린 팝업이 의도 없는 탭으로 닫히면 어느 쪽을 고른 것인지 알 수 없다).
 * 이 규칙이 interest의 InterestDialog와 달라 컴포넌트를 공용하지 않는다.
 */
export default function CareerDialog({
  isVisible,
  title,
  secondaryAction,
  primaryAction,
  onCloseRequest,
}: CareerDialogProps) {
  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onCloseRequest}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.secondaryButton]}
              onPress={secondaryAction.onPress}
              accessibilityRole="button"
              accessibilityLabel={secondaryAction.label}
            >
              <Text style={styles.secondaryLabel}>{secondaryAction.label}</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.primaryButton]}
              onPress={primaryAction.onPress}
              accessibilityRole="button"
              accessibilityLabel={primaryAction.label}
            >
              <Text style={styles.primaryLabel}>{primaryAction.label}</Text>
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
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  button: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: theme.color.border,
  },
  secondaryLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  primaryButton: {
    backgroundColor: theme.color.primary,
  },
  primaryLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
