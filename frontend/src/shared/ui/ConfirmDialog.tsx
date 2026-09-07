import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

interface DialogAction {
  label: string;
  onPress: () => void;
}

interface ConfirmDialogProps {
  isVisible: boolean;
  title: string;
  /** 제목만으로 부족할 때의 보조 문장. 없으면 제목 하나로 끝낸다 */
  body?: string;
  /** 왼쪽 보조 액션([닫기]·[취소]) */
  secondaryAction: DialogAction;
  /** 오른쪽 주 액션 — 주 액션은 오른쪽에 둔다(settings-uiux.md 5장 규칙과 같다) */
  primaryAction: DialogAction;
  /** 딤 탭·뒤로가기는 보조 액션과 같게 취급한다 */
  onCloseRequest: () => void;
}

/**
 * feature 공용 안내 다이얼로그 — 도메인 지식이 없어 shared에 둔다(architecture.md 4.3).
 *
 * 지금 쓰는 곳은 **인증된 이메일 변경 불가 안내** 하나이며, 프로필과 설정이 같은 화면을
 * 보여야 해서 어느 한쪽 feature에 두지 않았다(`auth.md` 4.4 — 확정 2026-09-07).
 *
 * `features/settings`의 `SettingsDialog`는 본문 슬롯(ReactNode)을 받는 별개 컴포넌트다.
 * 둘을 합치는 것은 그쪽 사용처 3곳을 함께 옮겨야 해서 이번 범위에 넣지 않았다.
 */
export default function ConfirmDialog({
  isVisible,
  title,
  body,
  secondaryAction,
  primaryAction,
  onCloseRequest,
}: ConfirmDialogProps) {
  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onCloseRequest}>
      <Pressable style={styles.backdrop} onPress={onCloseRequest} accessible={false}>
        <Pressable accessible={false} style={styles.dialogWrap}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <Text style={styles.title}>{title}</Text>
            {body !== undefined ? <Text style={styles.body}>{body}</Text> : null}
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
    // 다이얼로그·바텀시트는 xl 이다 — 면이 큰 표면일수록 곡률을 키워야 같은 부드러움으로 읽힌다
    borderRadius: theme.radius.xl,
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
  body: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.sm * 1.5,
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
