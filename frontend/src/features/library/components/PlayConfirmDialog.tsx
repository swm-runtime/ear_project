import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { LIBRARY_COPY } from '../library.copy';

interface PlayConfirmDialogProps {
  visible: boolean;
  /** 팝업에 적는 남은 횟수 — 서버가 내려준 값으로 화면이 계산한 힌트다 */
  remaining: number;
  onConfirm: () => void;
  onCancel: () => void;
  /** [오늘은 그만 보기] — 팝업을 닫고 그대로 재생한다. 차감은 그대로(library.md 4.3) */
  onSuppressToday: () => void;
}

/** L3 재생 확인 팝업 — 알리는 것은 남은 횟수와 1회 차감뿐. 업그레이드 유도를 얹지 않는다 */
export default function PlayConfirmDialog({
  visible,
  remaining,
  onConfirm,
  onCancel,
  onSuppressToday,
}: PlayConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dim}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <Text style={styles.title}>{LIBRARY_COPY.playConfirm.title(remaining)}</Text>
          <Text style={styles.body}>{LIBRARY_COPY.playConfirm.body}</Text>
          <View style={styles.buttonRow}>
            <Pressable
              style={styles.cancelButton}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel={LIBRARY_COPY.playConfirm.cancel}
            >
              <Text style={styles.cancelLabel}>{LIBRARY_COPY.playConfirm.cancel}</Text>
            </Pressable>
            <Pressable
              style={styles.playButton}
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel={LIBRARY_COPY.playConfirm.play}
            >
              <Text style={styles.playLabel}>{LIBRARY_COPY.playConfirm.play}</Text>
            </Pressable>
          </View>
          {/* 텍스트 버튼 — [취소]·[재생하기]와 나란히 세우지 않는다(library-uiux.md 4.6) */}
          <Pressable
            style={styles.suppressButton}
            onPress={onSuppressToday}
            accessibilityRole="button"
            accessibilityLabel={LIBRARY_COPY.playConfirm.suppressToday}
          >
            <Text style={styles.suppressLabel}>{LIBRARY_COPY.playConfirm.suppressToday}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    flex: 1,
    backgroundColor: theme.color.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  dialog: {
    alignSelf: 'stretch',
    backgroundColor: theme.color.background,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  body: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  cancelButton: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  cancelLabel: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  playButton: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
  },
  playLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
  suppressButton: {
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suppressLabel: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textDecorationLine: 'underline',
  },
});
