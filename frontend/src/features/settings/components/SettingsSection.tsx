import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
}

/** 섹션 구분 리스트의 한 섹션 — 제목 + 항목 묶음(settings-uiux.md 5장) */
export default function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.xs,
  },
  title: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.textSecondary,
    paddingHorizontal: theme.spacing.md,
  },
  body: {
    backgroundColor: theme.color.background,
  },
});
