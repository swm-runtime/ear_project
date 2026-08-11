import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

interface DialogAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

interface InterestDialogProps {
  isVisible: boolean;
  /** IM7 이탈 확인 — 질문 한 줄이면 제목만 둔다 */
  title?: string;
  /** IM4 해제 확인 — 별도 제목 없이 본문만 두는 한 문단 팝업이다(interest-management-uiux.md 4.4) */
  message?: string;
  /** 왼쪽 보조 액션([취소]·[계속 편집]) — 실수 비용이 큰 쪽이 확정이므로 안전한 쪽이 보조다 */
  secondaryAction: DialogAction;
  /** 오른쪽 주 액션(uiux 5장 — 주 액션 오른쪽). [나가기]도 위험색으로 그리지 않는다(4.6) */
  primaryAction: DialogAction;
  /** 딤 탭·뒤로가기는 보조 액션과 같다(팝업만 닫고 편집 유지) */
  onCloseRequest: () => void;
}

/** 관심사 관리의 공용 다이얼로그 — 해제 확인(IM4)·이탈 확인(IM7)이 함께 쓴다. 겹쳐 쌓지 않는다(uiux 3장) */
export default function InterestDialog({
  isVisible,
  title,
  message,
  secondaryAction,
  primaryAction,
  onCloseRequest,
}: InterestDialogProps) {
  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onCloseRequest}>
      <Pressable style={styles.backdrop} onPress={onCloseRequest} accessible={false}>
        <Pressable accessible={false} style={styles.dialogWrap}>
          <View style={styles.dialog} accessibilityViewIsModal>
            {title !== undefined ? <Text style={styles.title}>{title}</Text> : null}
            {message !== undefined ? <Text style={styles.message}>{message}</Text> : null}
            <View style={styles.actions}>
              <Pressable
                style={[styles.button, styles.secondaryButton]}
                onPress={secondaryAction.onPress}
                disabled={secondaryAction.disabled ?? false}
                accessibilityRole="button"
                accessibilityLabel={secondaryAction.label}
                accessibilityState={{ disabled: secondaryAction.disabled ?? false }}
              >
                <Text style={styles.secondaryLabel}>{secondaryAction.label}</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.primaryButton]}
                onPress={primaryAction.onPress}
                disabled={primaryAction.disabled ?? false}
                accessibilityRole="button"
                accessibilityLabel={primaryAction.label}
                accessibilityState={{ disabled: primaryAction.disabled ?? false }}
              >
                <Text style={styles.primaryLabel}>{primaryAction.label}</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
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
  dialogWrap: {
    alignSelf: 'stretch',
  },
  dialog: {
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
  message: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.md * 1.5,
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
