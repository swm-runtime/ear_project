import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import GlassCapsule, { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';

import { EXPLORE_COPY } from '../explore.copy';

interface ExploreSearchBarRowProps {
  /** 검색창 줄 우측의 잔여 재생 표시 자리(explore.md 4.4-1). null이면 자리를 비운다 */
  trailing: ReactNode;
  /** 검색창 탭 — 검색 화면(E6) 전환(explore.md 4.5-1) */
  onPress: () => void;
  /** `fill` — 콘텐츠 안(큰 제목 줄 밑, 목록과 같이 스크롤)에 놓일 때. 유리가 아니라 면(애플 뮤직 검색 탭의 검색창) */
  variant?: 'glass' | 'fill';
}

/**
 * 검색창 줄 — 검색은 MVP 포함이다(explore.md 4.5, 합의 2026-08-23 — 종전 "P1 유지·비활성
 * 노출" 폐기). 탭하면 검색 화면(E6)으로 전환하고 키보드가 올라온다. 입력은 검색 화면이
 * 받는다 — 이 줄은 진입점일 뿐이라 TextInput을 두지 않는다.
 */
export default function ExploreSearchBarRow({
  trailing,
  onPress,
  variant = 'glass',
}: ExploreSearchBarRowProps) {
  return (
    <View style={styles.row}>
      {/* 유리 캡슐(iOS 26 시스템 검색처럼) — 목록 위에 떠 있는 컨트롤이라 면이 아니라 유리다(2026-09-24 PM) */}
      <GlassCapsule style={styles.searchBox} variant={variant}>
        <Pressable
          style={styles.searchPressable}
          onPress={onPress}
          accessibilityRole="search"
          accessibilityLabel={EXPLORE_COPY.search.placeholder}
        >
          <Text style={styles.placeholder}>{EXPLORE_COPY.search.placeholder}</Text>
        </Pressable>
      </GlassCapsule>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    // 상태 바 바로 밑(8) — 애플 뮤직 검색창 자리(PM 2026-09-25 비교). 종전 24(프로필 신원 행과 맞춤, 09-18)는 뿌연 구간을 길게 보였다
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  // 유리 캡슐(GlassCapsule 이 바탕·윤곽·full 반지름을 준다). 종전 surface 면 + md 반지름(09-22)에서 바꿈
  searchBox: {
    flex: 1,
  },
  searchPressable: {
    height: HEADER_CONTROL_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  placeholder: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
});
