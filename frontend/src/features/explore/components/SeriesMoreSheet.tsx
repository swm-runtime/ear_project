import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import BottomSheet from '@/shared/ui/BottomSheet';
import { Text } from '@/shared/ui/Typography';

import { IS_SHARE_ENABLED, SHARE_COPY } from '@/features/share';

import { EXPLORE_COPY } from '../explore.copy';
import type { SeriesDetail } from '../explore.types';

/** 소개 전문이 길 때 시트가 화면을 다 덮지 않게 — 넘치면 시트 안에서 스크롤 */
const ABOUT_MAX_HEIGHT = 360;

interface SeriesMoreSheetProps {
  /** null 이면 닫힘 */
  series: SeriesDetail['series'] | null;
  /** [공유] — 시트를 닫고 닫힘이 끝난 뒤 OS 공유 시트를 연다(useDeferredSheetShare) */
  onShare: () => void;
  onDismiss: () => void;
  /** 모달이 실제로 내려간 뒤 — 보류한 공유를 여기서 연다 */
  onDismissed: () => void;
}

/**
 * 시리즈 화면 앱바 ⋯ 시트(PM 2026-10-22 — "공유 + 소개 전체 보기"). 머리에서 소개 문단을 빼고 [재생]을 둔 대신
 * 소개 전문은 여기서 본다. [소개 전체 보기]는 새 시트를 띄우지 않고 **같은 시트가 소개 글로 바뀐다**(시트 두 장을
 * 잇따라 띄우면 닫힘·열림 모션이 겹친다). 소개가 비면 그 행을 그리지 않는다
 */
export default function SeriesMoreSheet({
  series,
  onShare,
  onDismiss,
  onDismissed,
}: SeriesMoreSheetProps) {
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  // 닫히는 모션 동안 내용이 비지 않게 마지막 값을 붙들어 둔다(ExploreMoreSheet 와 같은 방식)
  const [shown, setShown] = useState(series);
  if (series !== null && series !== shown) setShown(series);
  const description = shown?.description.trim() ?? '';

  return (
    <BottomSheet
      isVisible={series !== null}
      onRequestClose={onDismiss}
      onClosed={onDismissed}
      // 다시 열면 행 목록부터 — 숨김이 끝난 뒤(양 플랫폼) 되돌린다. 내려가는 동안엔 보던 화면 그대로
      onHidden={() => setIsAboutOpen(false)}
      sheetStyle={styles.sheet}
    >
      <View accessibilityViewIsModal>
        {shown ? (
          <>
            <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
              {shown.title}
            </Text>
            {isAboutOpen ? (
              <ScrollView style={styles.aboutScroll} contentContainerStyle={styles.aboutContent}>
                <Text style={styles.about}>{description}</Text>
              </ScrollView>
            ) : (
              <>
                {IS_SHARE_ENABLED ? (
                  <Pressable
                    style={styles.action}
                    onPress={onShare}
                    accessibilityRole="button"
                    accessibilityLabel={SHARE_COPY.action}
                  >
                    <Text style={styles.actionLabel}>{SHARE_COPY.action}</Text>
                  </Pressable>
                ) : null}
                {description.length > 0 ? (
                  <Pressable
                    style={styles.action}
                    onPress={() => setIsAboutOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={EXPLORE_COPY.series.aboutAction}
                  >
                    <Text style={styles.actionLabel}>{EXPLORE_COPY.series.aboutAction}</Text>
                  </Pressable>
                ) : null}
              </>
            )}
            <Pressable
              style={styles.action}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={EXPLORE_COPY.sheet.close}
            >
              <Text style={[styles.actionLabel, styles.closeLabel]}>
                {EXPLORE_COPY.sheet.close}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: theme.color.background,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: 'continuous',
    paddingVertical: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  title: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  aboutScroll: {
    maxHeight: ABOUT_MAX_HEIGHT,
  },
  aboutContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  about: {
    fontSize: theme.font.size.sm,
    lineHeight: theme.font.size.sm * 1.6,
    color: theme.color.textPrimary,
  },
  action: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  actionLabel: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  closeLabel: {
    color: theme.color.textSecondary,
  },
});
