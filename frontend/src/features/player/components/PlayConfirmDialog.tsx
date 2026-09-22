import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { PLAYER_COPY } from '../player.copy';

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
          {/* 제목 줄 오른쪽 위에 [오늘은 그만 보기](2026-09-22 PM) — 버튼 줄 아래 밑줄 글자로 두면 세 번째 버튼처럼
              읽혀 시선이 갈렸다. 모서리의 작은 글자는 "설정"으로 읽힌다 */}
          <View style={styles.header}>
            <Text style={styles.title}>{PLAYER_COPY.playConfirm.title(remaining)}</Text>
            <Pressable
              style={styles.suppressButton}
              onPress={onSuppressToday}
              hitSlop={theme.spacing.sm}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.playConfirm.suppressToday}
            >
              <Text style={styles.suppressLabel}>{PLAYER_COPY.playConfirm.suppressToday}</Text>
            </Pressable>
          </View>
          <Text style={styles.body}>{PLAYER_COPY.playConfirm.body}</Text>
          <View style={styles.buttonRow}>
            <Pressable
              style={styles.cancelButton}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.playConfirm.cancel}
            >
              <Text style={styles.cancelLabel}>{PLAYER_COPY.playConfirm.cancel}</Text>
            </Pressable>
            <Pressable
              style={styles.playButton}
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.playConfirm.play}
            >
              <Text style={styles.playLabel}>{PLAYER_COPY.playConfirm.play}</Text>
            </Pressable>
          </View>
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
    borderRadius: theme.radius.xl,
    borderCurve: 'continuous',
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
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
  // 취소는 테두리 없이 연한 면으로(2026-09-22 PM) — 검정 [재생하기] 옆에서 선으로 그린 상자는 낡아 보였다
  cancelButton: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
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
    borderCurve: 'continuous',
    backgroundColor: theme.color.primary,
  },
  playLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
  // 제목 줄의 작은 글자 — 히트 44pt 는 hitSlop 으로 채운다
  suppressButton: {
    paddingTop: 4,
  },
  suppressLabel: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
});
