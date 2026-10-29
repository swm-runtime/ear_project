import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import StarIcon from '@/shared/ui/StarIcon';
import { Text } from '@/shared/ui/Typography';

import { CONTENT_REVIEW_STAR_VALUES } from '../content-review.constants';
import { CONTENT_REVIEW_COPY } from '../content-review.copy';
import { useMyContentReview } from '../hooks/useMyContentReview';
import { selectIsContentReviewEnabled, useContentReviewStore } from '../store/content-review.store';

interface MyContentReviewRowProps {
  contentId: string;
  /** [수정] · [후기 남기기] — 후기 시트(L17)를 연다(`useContentReviewLauncher().request`) */
  onOpen: () => void;
}

const COPY = CONTENT_REVIEW_COPY.detail;

/**
 * 콘텐츠 상세의 "내 후기" 줄(content-detail-uiux.md 4.6 — KAN-280). 내 별점 + [수정], 아직 없으면 [후기 남기기].
 * **후기 기능이 꺼져 있으면(받은 적 없음 · 실패 포함) 줄이 없다.** 들어 본 적 없는 편이라 서버가 쓸 수 없다고 하고 내 후기도 없으면
 * 줄을 그리지 않는다 — 누르면 "들어 본 편에만…" 안내뿐이라 자리만 차지한다. 조회 중 · 실패에도 그리지 않는다(자리가 튀지 않게).
 * 평균 별점 · 다른 사람의 후기는 보이지 않는다(content-review.md 1장).
 */
export default function MyContentReviewRow({ contentId, onOpen }: MyContentReviewRowProps) {
  const isEnabled = useContentReviewStore(selectIsContentReviewEnabled);
  const query = useMyContentReview(contentId);
  const state = query.data;
  if (!isEnabled || state === undefined || !state.enabled) return null;
  const review = state.review;
  if (review === null && !state.reviewable) return null;

  const actionLabel = review !== null ? COPY.edit : COPY.write;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{COPY.label}</Text>
      <View style={styles.value}>
        {review !== null ? (
          <View
            style={styles.stars}
            accessible
            accessibilityRole="image"
            accessibilityLabel={COPY.starsA11y(review.stars)}
          >
            {CONTENT_REVIEW_STAR_VALUES.map((value) => (
              <StarIcon
                key={value}
                size={STAR_SIZE}
                isFilled={value <= review.stars}
                color={value <= review.stars ? theme.color.textPrimary : theme.color.textMuted}
              />
            ))}
          </View>
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.action, pressed ? styles.actionPressed : null]}
          onPress={onOpen}
          hitSlop={ACTION_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={review !== null ? `${COPY.label}, ${actionLabel}` : actionLabel}
          testID="my-content-review-action"
        >
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const STAR_SIZE = 16;
/** 메타 행 높이를 벌리지 않고 터치만 44 로 넓힌다(design.md §6 — 상세의 시리즈 줄과 같은 방식) */
const ACTION_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  label: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  value: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
  action: {
    marginLeft: 'auto',
  },
  actionPressed: {
    opacity: 0.5,
  },
  actionLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
});
