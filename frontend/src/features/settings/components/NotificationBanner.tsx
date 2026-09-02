import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';

import { SETTINGS_COPY } from '../settings.copy';

const CHEVRON_SIZE = 18;

interface NotificationBannerProps {
  onPress: () => void;
}

/**
 * 알림 사전 안내 유도 배너 — OS 권한 미결정에만 노출한다((b)안, settings-uiux.md 4.3).
 * 닫기(×)를 두지 않는다 — 노출·숨김은 권한 상태 하나로 판정하고 "닫음" 로컬 상태를 만들지 않는다.
 * 문구는 사전 안내의 헤드라인 그대로다(notification.md 5장 소유).
 */
export default function NotificationBanner({ onPress }: NotificationBannerProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={SETTINGS_COPY.notification.bannerA11y}
    >
      <Text style={styles.text}>{SETTINGS_COPY.notification.banner}</Text>
      <View accessibilityElementsHidden importantForAccessibility="no">
        <ChevronIcon direction="right" size={CHEVRON_SIZE} color={theme.color.textSecondary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: theme.touchTarget.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
    flexShrink: 1,
  },
});
