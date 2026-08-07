import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '@/shared/theme';

import { LIBRARY_COPY } from '../library.copy';

export type LibraryBannerState = { type: 'offline' } | { type: 'newArrivals'; count: number };

interface LibraryBannerProps {
  banner: LibraryBannerState;
  /** 새 콘텐츠 도착 배너만 탭 대상이다 — 걸어둔 탭·주제 필터는 유지된다(uiux 4.1) */
  onPress: () => void;
}

/** 상단 배너 — 한 번에 하나만 노출한다. 우선순위는 오프라인 > 드립 준비 중 > 새 콘텐츠 도착 */
export default function LibraryBanner({ banner, onPress }: LibraryBannerProps) {
  if (banner.type === 'offline') {
    return (
      <Text style={[styles.banner, styles.offline]} accessibilityLiveRegion="polite">
        {LIBRARY_COPY.banner.offline}
      </Text>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={LIBRARY_COPY.banner.newArrivals(banner.count)}
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.banner, styles.newArrivals]}>
        {LIBRARY_COPY.banner.newArrivals(banner.count)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    textAlign: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.font.size.sm,
    overflow: 'hidden',
  },
  offline: {
    backgroundColor: theme.color.surface,
    color: theme.color.textSecondary,
  },
  newArrivals: {
    backgroundColor: theme.color.primary,
    color: theme.color.onPrimary,
    fontWeight: '600',
  },
});
