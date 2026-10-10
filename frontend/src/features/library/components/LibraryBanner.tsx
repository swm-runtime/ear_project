import { StyleSheet } from 'react-native';

import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import { LIBRARY_COPY } from '../library.copy';

export type LibraryBannerState = { type: 'offline' };

interface LibraryBannerProps {
  banner: LibraryBannerState;
}

/** 상단 오프라인 안내 — 새 도착은 하단 라이브러리 탭의 숫자 배지로 표시한다. */
export default function LibraryBanner({ banner }: LibraryBannerProps) {
  if (banner.type === 'offline') {
    return (
      <Text style={[styles.banner, styles.offline]} accessibilityLiveRegion="polite">
        {LIBRARY_COPY.banner.offline}
      </Text>
    );
  }

  return null;
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
});
