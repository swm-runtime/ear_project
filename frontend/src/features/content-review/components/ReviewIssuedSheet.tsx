import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import BottomSheet from '@/shared/ui/BottomSheet';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text } from '@/shared/ui/Typography';

import { CONTENT_REVIEW_COPY } from '../content-review.copy';
import type { Promotion } from '../content-review.types';

interface ReviewIssuedSheetProps {
  /** 이번 저장으로 발급된 프로모션 — null 이면 닫힌다 */
  promotion: Promotion | null;
  /** [지금 쓰기] — 시트가 닫힌 뒤 S12 로 간다(쓰는 쪽이 닫힘 완료를 기다린다) */
  onUseNow: () => void;
  /** [나중에] · 딤 탭 · 끌어 닫기 · 뒤로가기 */
  onLater: () => void;
  onClosed: () => void;
}

const COPY = CONTENT_REVIEW_COPY.issued;

/**
 * 프로모션 발급 안내 시트(L19 — library-uiux.md 4.15). 후기 시트가 **완전히 닫힌 뒤** 연다 — 모달 둘을 겹치지 않는다
 * (iOS 는 겹친 두 번째 모달을 띄우지 않거나 화면이 굳는다). 이름 · 요금제 · 일수 · 사용 기한은 응답 값 그대로다.
 */
export default function ReviewIssuedSheet({
  promotion,
  onUseNow,
  onLater,
  onClosed,
}: ReviewIssuedSheetProps) {
  // 내려가는 동안 보여 줄 내용 — 더보기 시트와 같은 파생 상태 패턴
  const [shown, setShown] = useState(promotion);
  if (promotion !== null && promotion !== shown) setShown(promotion);

  return (
    <BottomSheet
      isVisible={promotion !== null}
      onRequestClose={onLater}
      onClosed={Platform.OS === 'ios' ? onClosed : undefined}
      onHidden={Platform.OS !== 'ios' ? onClosed : undefined}
      sheetStyle={styles.sheet}
    >
      <View accessibilityViewIsModal>
        {shown !== null ? (
          <>
            <Text style={styles.title} accessibilityRole="header">
              {COPY.title(shown.name)}
            </Text>
            <Text style={styles.body}>
              {COPY.body(shown.planName, shown.grantDays, shown.lastUsableDate)}
            </Text>
            <Pressable
              style={[pillButton.base, pillButton.primary, styles.primary]}
              onPress={onUseNow}
              accessibilityRole="button"
              accessibilityLabel={COPY.useNow}
            >
              <Text style={pillButton.primaryLabel}>{COPY.useNow}</Text>
            </Pressable>
            <Pressable
              style={styles.laterButton}
              onPress={onLater}
              accessibilityRole="button"
              accessibilityLabel={COPY.later}
            >
              <Text style={styles.laterLabel}>{COPY.later}</Text>
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
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
  },
  title: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  body: {
    marginTop: theme.spacing.sm,
    fontSize: theme.font.size.sm,
    lineHeight: theme.font.size.sm * 1.5,
    color: theme.color.textSecondary,
  },
  primary: {
    marginTop: theme.spacing.lg,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  laterButton: {
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xs,
  },
  laterLabel: {
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
});
