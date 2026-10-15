import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { localized, type LocalizedCopy } from '@/shared/i18n/localized';
import { theme } from '@/shared/theme';

const ko = { loadingA11y: '로딩 중' } as const;
const en: LocalizedCopy<typeof ko> = { loadingA11y: 'Loading' };
const COPY = localized({ ko, en });

interface LoadingOverlayProps {
  visible: boolean;
}

/** 화면 전체를 덮는 로딩 오버레이 — 제공자 인증 복귀 대기 등(auth-uiux.md 4.2) */
export default function LoadingOverlay({ visible }: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay} accessibilityLabel={COPY.loadingA11y}>
      <ActivityIndicator size="large" color={theme.color.onPhoto} />
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
