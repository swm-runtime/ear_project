import { Pressable, StyleSheet } from 'react-native';

import { PROVIDER_BRAND } from '../auth.constants';
import { AUTH_COPY } from '../auth.copy';
import type { SocialProvider } from '../auth.types';
import ProviderIcon from './ProviderIcon';

interface ProviderButtonProps {
  provider: SocialProvider;
  disabled: boolean;
  onPress: (provider: SocialProvider) => void;
}

/** 원형 버튼 지름 — 터치 타깃 최소 44pt를 넘긴다(auth-uiux.md 7) */
const CIRCLE_SIZE = 64;
const ICON_SIZE = 28;

/**
 * 제공자 로그인 버튼 — 브랜드 색 원형 + 심볼.
 * 색·로고는 브랜드 가이드 고정값을 쓴다(auth-uiux.md 4.1).
 *
 * 명칭을 글자로 두지 않으므로 **심볼이 유일한 식별 단서다.** 화면에 안 보이더라도
 * accessibilityLabel에는 전체 문구를 넣는다 — 스크린리더에서 "버튼"만 세 번 읽히면 못 고른다.
 */
export default function ProviderButton({ provider, disabled, onPress }: ProviderButtonProps) {
  const brand = PROVIDER_BRAND[provider];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.circle,
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
      accessibilityLabel={AUTH_COPY.start.provider[provider]}
    >
      <ProviderIcon provider={provider} size={ICON_SIZE} color={brand.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
