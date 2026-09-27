import { Children, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
}

/**
 * 섹션 구분 리스트의 한 섹션 — 제목 + 항목 묶음(settings-uiux.md 5장).
 *
 * 연한 면으로 항목을 묶고, 안쪽 구분선과 보조 라벨로 섹션의 위계를 만든다.
 */
export default function SettingsSection({ title, children }: SettingsSectionProps) {
  const items = Children.toArray(children);

  return (
    <View style={styles.section}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.body}>
        {items.map((item, index) => (
          <View key={index}>
            {/* 첫 항목 위에는 긋지 않는다 — 제목이 밑줄 그어진 것처럼 보인다 */}
            {index > 0 ? <View style={styles.divider} pointerEvents="none" /> : null}
            {item}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
  },
  // 프로필 카드의 보조 라벨과 같은 크기, 행의 글자 시작점과 같은 들여쓰기.
  title: {
    fontSize: theme.font.size.xs,
    fontWeight: '500',
    color: theme.color.textSecondary,
    paddingHorizontal: theme.spacing.md,
  },
  body: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  // 항목 글자와 같은 선에서 시작한다 — 왼쪽 끝까지 그으면 섹션 경계와 구분되지 않는다
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: theme.spacing.md,
    marginRight: theme.spacing.md,
    backgroundColor: theme.color.border,
  },
});
