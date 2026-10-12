import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import InlineNotice from '@/shared/ui/InlineNotice';

import { LIBRARY_COPY } from '../library.copy';

export type LibraryBannerState = { type: 'offline' };

interface LibraryBannerProps {
  banner: LibraryBannerState;
}

/** 상단 오프라인 안내 — 새 도착은 하단 라이브러리 탭의 숫자 배지로 표시한다. */
export default function LibraryBanner({ banner }: LibraryBannerProps) {
  if (banner.type === 'offline') {
    return (
      <View style={styles.banner}>
        <InlineNotice message={LIBRARY_COPY.banner.offline} offline />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
});
