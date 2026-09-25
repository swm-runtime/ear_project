import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

interface LargeTitleRowProps {
  title: string;
  /** 제목 오른쪽의 컨트롤 — 잔여 링·툴바 캡슐. 없으면 제목만 */
  trailing?: ReactNode;
}

/** 제목 줄의 높이 — 바의 작은 제목이 이만큼 스크롤되면 나타난다(useFadingNativeTitle) */
export const LARGE_TITLE_ROW_HEIGHT = 52;

/**
 * **콘텐츠 안의 큰 제목 줄** — 애플 뮤직·앱스토어·팟캐스트 탭 화면의 상단(PM 2026-09-26 00:29 "얘네는 뭔데").
 * 큰 제목(34pt bold, iOS 큰 제목 크기)과 오른쪽 컨트롤이 **같은 줄**이고, 목록과 같이 스크롤해 바 밑으로 들어간다.
 * UIKit 큰 제목 API 는 바 버튼을 제목 위 줄에만 두므로 애플도 이 줄은 직접 그린다(SwiftUI inlineLarge · 커스텀 헤더).
 * 바에는 제목이 없다가, 이 줄이 바 밑으로 들어가면 작은 제목이 페이드인한다(`useFadingNativeTitle`).
 */
export default function LargeTitleRow({ title, trailing }: LargeTitleRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: LARGE_TITLE_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  title: {
    flexShrink: 1,
    fontSize: theme.font.size.xxl,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
});
