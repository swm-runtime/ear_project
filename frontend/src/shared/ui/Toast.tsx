import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';

import { useNoticeDockStore } from './notice-dock.store';
import Snackbar from './Snackbar';
import { useToastStore } from './toast.store';

/** auth-uiux.md 5 — 토스트는 3초 후 자동 소멸한다 */
const TOAST_DURATION_MS = 3_000;

export default function Toast() {
  const message = useToastStore((s) => s.message);
  const action = useToastStore((s) => s.action);
  const hide = useToastStore((s) => s.hide);
  const insets = useSafeAreaInsets();
  const dockBottom = useNoticeDockStore((s) => s.bottom);

  // 메시지 표시와 자동 소멸 타이머를 동기화한다
  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(hide, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message, hide]);

  if (message === null) return null;

  return (
    <View
      style={[styles.container, { bottom: Math.max(insets.bottom + theme.spacing.md, dockBottom) }]}
      // 액션이 있을 때만 터치를 받는다 — 없으면 아래 화면 조작을 가리지 않는다
      pointerEvents={action ? 'box-none' : 'none'}
      accessibilityLiveRegion="polite"
    >
      <Snackbar
        message={message}
        action={
          action
            ? {
                label: action.label,
                onPress: () => {
                  hide();
                  action.onPress();
                },
              }
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    alignItems: 'center',
  },
});
