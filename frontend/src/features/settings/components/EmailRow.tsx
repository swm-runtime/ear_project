import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text } from '@/shared/ui/Typography';

import type { EmailRowVM, SectionState } from '../hooks/useSettingsScreen';
import { SETTINGS_COPY } from '../settings.copy';

interface EmailRowProps {
  state: SectionState<EmailRowVM>;
  /**
   * 미등록·미인증에서는 auth의 인증 화면으로, **인증됨에서는 변경 불가 안내**로 간다
   * (settings-uiux.md 4.2 — 확정 2026-09-07). 분기는 화면 훅이 갖는다.
   */
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
      // 인증된 주소는 앱에서 바꿀 수 없다(auth.md 4.4) — 진입점 자체를 두지 않는다.
      // 변경이 필요한 사용자는 값을 탭해 안내를 보고 [문의하기]로 간다.
      return [];
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
            style={({ pressed }) => [pillButton.base, styles.action, pressed && styles.pressed]}
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
      <Pressable
        style={({ pressed }) => [styles.info, pressed && styles.pressed]}
        onPress={onPress}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${SETTINGS_COPY.email.label}, ${valueA11y}`}
      >
        <Text style={styles.label}>{SETTINGS_COPY.email.label}</Text>
        <View style={styles.valueLine}>
          {/* 미등록이면 값 자리를 비운다 — 배지가 같은 말을 한다(ProfileHeader 와 같은 규칙) */}
          {vm.email !== null ? <Text style={styles.value}>{vm.email}</Text> : null}
          {/* 인증 전이면 배지를 단다 — 미등록도 포함이다(profile.md 4.3 과 같은 구분) */}
          {vm.status !== 'verified' ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {SETTINGS_COPY.email.unverifiedGlyph}{' '}
                {vm.status === 'unregistered'
                  ? SETTINGS_COPY.email.unregisteredBadge
                  : SETTINGS_COPY.email.unverifiedBadge}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.right}>
        {actionLabels(vm).map((label) => (
          <Pressable
            key={label}
            style={({ pressed }) => [pillButton.base, styles.action, pressed && styles.pressed]}
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
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    // wrap 아래에서는 alignContent 가 줄의 세로 위치를 정한다 — 없으면 flex-start 로 위에 붙는다(SettingsRow 와 같은 이유)
    alignContent: 'center',
  },
  info: {
    flexGrow: 1,
    flexBasis: 160,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  pressed: {
    opacity: 0.6,
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
    maxWidth: '100%',
  },
  badge: {
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    backgroundColor: theme.color.warningSurface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: theme.color.warning,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    flexShrink: 1,
    // auto 여백 대신 남는 폭을 차지해 끝으로 민다 — wrap 과 겹치면 우측 묶음이 쪼그라든다(SettingsRow 와 같은 이유)
    flexGrow: 1,
  },
  errorText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    flexShrink: 1,
  },
  // 흰 알약(회색 면 위) — 모양은 공용 알약(pillButton.base), 면 색·크기만 여기서
  action: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.color.background,
  },
  actionLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
});
