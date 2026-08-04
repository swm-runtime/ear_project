import { useRoute } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

/** 미구현 화면 임시 표시 — onboarding·library feature 구현 시 교체한다 */
export default function PlaceholderScreen() {
  const route = useRoute();

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{route.name}</Text>
      <Text style={styles.caption}>화면 준비 중</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  name: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  caption: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
});
