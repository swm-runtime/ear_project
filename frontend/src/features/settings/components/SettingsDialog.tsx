import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

interface DialogAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

interface SettingsDialogProps {
  isVisible: boolean;
  title: string;
  /** 링크 텍스트 등 본문 슬롯 — 로그아웃처럼 질문 하나면 비워 둔다(settings-uiux.md 4.4) */
  children?: ReactNode;
  /** 왼쪽 보조 액션([취소]·[닫기]) */
  secondaryAction: DialogAction;
  /** 오른쪽 주 액션(settings-uiux.md 5장 — 주 액션 오른쪽) */
  primaryAction: DialogAction;
  /** 딤 탭·뒤로가기는 취소와 같다(settings-uiux.md 5장) */
  onCloseRequest: () => void;
}

/** 설정의 공용 다이얼로그 — 로그아웃 확인(S5)·권한 안내(S4)·링크 복사 폴백이 함께 쓴다 */
export default function SettingsDialog({
  isVisible,
  title,
  children,
  secondaryAction,
  primaryAction,
  onCloseRequest,
}: SettingsDialogProps) {
  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onCloseRequest}>
      <Pressable style={styles.backdrop} onPress={onCloseRequest} accessible={false}>
        <Pressable accessible={false} style={styles.dialogWrap}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <Text style={styles.title}>{title}</Text>
            {children}
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
