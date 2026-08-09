import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import type { EmailRowVM, SectionState } from '../hooks/useSettingsScreen';
import { SETTINGS_COPY } from '../settings.copy';

interface EmailRowProps {
  state: SectionState<EmailRowVM>;
  /** 세 버튼 모두 auth의 같은 인증 화면으로 간다(settings-uiux.md 4.2) */
  onPress: () => void;
  onRetry: () => void;
  isRetrying: boolean;
}

/** 상태별 버튼 라벨(settings-uiux.md 4.2 표) */
const actionLabels = (vm: EmailRowVM): string[] => {
  switch (vm.status) {
    case 'unregistered':
      return [SETTINGS_COPY.email.register];
    case 'unverified':
      return [SETTINGS_COPY.email.verify, SETTINGS_COPY.email.change];
    case 'verified':
      return [SETTINGS_COPY.email.change];
  }
};

/**
 * 계정 섹션의 이메일 항목 — 미등록 / 미인증(배지) / 인증됨 세 상태(settings.md 4.1,
 * profile.md 4.3과 동일 구분). 이메일 주소는 말줄임 대신 줄바꿈한다(settings-uiux.md 7장).
 */
export default function EmailRow({ state, onPress, onRetry, isRetrying }: EmailRowProps) {
  if (state.kind === 'error') {
    return (
      <View style={styles.row}>
        <Text style={styles.label}>{SETTINGS_COPY.email.label}</Text>
        <View style={styles.right}>
          <Text style={styles.errorText}>{SETTINGS_COPY.summaryError}</Text>
          <Pressable
            style={styles.action}
            onPress={onRetry}
            disabled={isRetrying}
            accessibilityRole="button"
            accessibilityLabel={SETTINGS_COPY.retry}
            accessibilityState={{ disabled: isRetrying }}
          >
            <Text style={styles.actionLabel}>{SETTINGS_COPY.retry}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const vm = state.data;
  const valueText = vm.email ?? SETTINGS_COPY.email.unregistered;
  const valueA11y =
    vm.status === 'unverified' && vm.email !== null
      ? SETTINGS_COPY.email.unverifiedValueA11y(vm.email)
      : valueText;

  return (
    <View style={styles.row}>
      <View
        style={styles.info}
        accessible
        accessibilityLabel={`${SETTINGS_COPY.email.label}, ${valueA11y}`}
      >
        <Text style={styles.label}>{SETTINGS_COPY.email.label}</Text>
        <View style={styles.valueLine}>
          <Text style={styles.value}>{valueText}</Text>
          {vm.status === 'unverified' ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{SETTINGS_COPY.email.unverifiedBadge}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.right}>
        {actionLabels(vm).map((label) => (
          <Pressable
            key={label}
            style={styles.action}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <Text style={styles.actionLabel}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  info: {
    flexShrink: 1,
    gap: theme.spacing.xs,
  },
  label: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  valueLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  value: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    flexShrink: 1,
  },
  badge: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  badgeText: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.danger,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  action: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  actionLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
});
