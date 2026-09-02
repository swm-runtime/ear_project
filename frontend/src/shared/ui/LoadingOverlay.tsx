import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';

interface LoadingOverlayProps {
  visible: boolean;
}

/** 화면 전체를 덮는 로딩 오버레이 — 제공자 인증 복귀 대기 등(auth-uiux.md 4.2) */
export default function LoadingOverlay({ visible }: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay} accessibilityLabel="로딩 중">
      <ActivityIndicator size="large" color={theme.color.onPrimary} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.color.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
