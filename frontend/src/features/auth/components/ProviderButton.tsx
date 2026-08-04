import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '@/shared/theme';

import { PROVIDER_BRAND } from '../auth.constants';
import { AUTH_COPY } from '../auth.copy';
import type { SocialProvider } from '../auth.types';

interface ProviderButtonProps {
  provider: SocialProvider;
  disabled: boolean;
  onPress: (provider: SocialProvider) => void;
}

/** 제공자 로그인 버튼 — 색·명칭은 브랜드 가이드 고정값을 쓴다(auth-uiux.md 4.1) */
export default function ProviderButton({ provider, disabled, onPress }: ProviderButtonProps) {
  const brand = PROVIDER_BRAND[provider];
  const label = AUTH_COPY.start.provider[provider];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: brand.background,
          borderWidth: brand.border ? StyleSheet.hairlineWidth : 0,
          borderColor: brand.border,
        },
        pressed && styles.pressed,
      ]}
      disabled={disabled}
      onPress={() => onPress(provider)}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.label, { color: brand.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: theme.touchTarget.minHeight,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  pressed: {
    opacity: 0.8,
  },
  label: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
  },
});
