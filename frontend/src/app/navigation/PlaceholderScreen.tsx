import { useRoute } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';

import { localized, type LocalizedCopy } from '@/shared/i18n/localized';
import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

const ko = { preparing: '화면 준비 중' } as const;
const en: LocalizedCopy<typeof ko> = { preparing: 'Coming soon' };
const COPY = localized({ ko, en });

/** 미구현 화면 임시 표시 — onboarding·library feature 구현 시 교체한다 */
export default function PlaceholderScreen() {
  const route = useRoute();

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{route.name}</Text>
      <Text style={styles.caption}>{COPY.preparing}</Text>
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
