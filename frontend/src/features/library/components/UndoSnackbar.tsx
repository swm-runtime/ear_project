import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import { useNoticeDockStore } from '@/shared/ui/notice-dock.store';
import Snackbar from '@/shared/ui/Snackbar';

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
  const bottom = useNoticeDockStore((s) => s.bottom);
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <View
      style={[styles.container, { bottom: Math.max(bottom, insets.bottom + theme.spacing.md) }]}
      pointerEvents="box-none"
    >
      <Snackbar
        message={LIBRARY_COPY.deleteSnackbar.message}
        action={{ label: LIBRARY_COPY.deleteSnackbar.undo, onPress: onUndoPress }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    alignItems: 'center',
  },
});
