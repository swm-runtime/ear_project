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
 * 항목 사이에 구분선을 넣는다(2026-09-02) — 흰 배경 위에 행만 쌓으면 어디까지가 한 묶음인지
 * 보이지 않아 전체가 하나의 긴 목록으로 읽힌다. 섹션 배경을 깔지 않고 선과 여백으로만 나눈다.
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
            {index > 0 ? <View style={styles.divider} /> : null}
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
  },
  // 12 → 14. 12는 보조색과 겹쳐 묶음의 머리로 읽히지 않았다
  title: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.textSecondary,
    paddingHorizontal: theme.spacing.md,
  },
  body: {
    backgroundColor: theme.color.background,
  },
  // 항목 글자와 같은 선에서 시작한다 — 왼쪽 끝까지 그으면 섹션 경계와 구분되지 않는다
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: theme.spacing.md,
    backgroundColor: theme.color.border,
  },
});
