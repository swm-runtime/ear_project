import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { LIBRARY_COPY } from '../library.copy';

interface UndoSnackbarProps {
  visible: boolean;
  onUndoPress: () => void;
}

/**
 * L5 삭제 스낵바 — "삭제했어요" + [실행 취소]만 둔다. 재추천·영구 제외 문구를 넣지 않는다.
 * 소멸 타이머(5초)는 화면 훅이 소유한다. 미니플레이어·하단 탭 위에 겹쳐 띄운다(uiux 4.4).
 */
export default function UndoSnackbar({ visible, onUndoPress }: UndoSnackbarProps) {
  if (!visible) return null;

  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <Text style={styles.message}>{LIBRARY_COPY.deleteSnackbar.message}</Text>
      <Pressable
        style={styles.undoButton}
        onPress={onUndoPress}
        accessibilityRole="button"
        accessibilityLabel={LIBRARY_COPY.deleteSnackbar.undo}
      >
        <Text style={styles.undoLabel}>{LIBRARY_COPY.deleteSnackbar.undo}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    bottom: theme.spacing.xxl + theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.textPrimary,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  message: {
    fontSize: theme.font.size.sm,
    color: theme.color.onPrimary,
  },
  undoButton: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  undoLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.primary,
  },
});
