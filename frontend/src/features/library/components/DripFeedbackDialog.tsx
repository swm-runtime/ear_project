import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import ConfirmDialog from '@/shared/ui/ConfirmDialog';
import RemoteImage from '@/shared/ui/RemoteImage';
import StarIcon from '@/shared/ui/StarIcon';
import { Text } from '@/shared/ui/Typography';

import { LIBRARY_COPY } from '../library.copy';
import type { DripFeedbackItem } from '../library.types';

/** 별 1~5 — drip-feedback-api.md 4.2 `stars` 범위 */
export const DRIP_FEEDBACK_STAR_VALUES = [1, 2, 3, 4, 5] as const;

export interface DripFeedbackDialogProps {
  isVisible: boolean;
  items: readonly DripFeedbackItem[];
  /** 편별로 매긴 별 — 없으면 아직 안 매겼다 */
  starsByContentId: Readonly<Record<string, number>>;
  isSending: boolean;
  /** 전송 실패 — 인라인 에러 + [다시 시도] */
  hasSendError: boolean;
  onStarsChange: (contentId: string, stars: number) => void;
  onSend: () => void;
  /** [닫기]·바깥 탭·뒤로가기 → dismiss */
  onClose: () => void;
  /** [이번 주 그만 보기] → mute */
  onMuteThisWeek: () => void;
}

const COPY = LIBRARY_COPY.dripFeedback;

/**
 * "최근 추천 어떠셨나요?" 팝업(drip-feedback.md 5장 — KAN-224). 공용 확인 다이얼로그(design.md §5) 위에 편성분 1~2편을
 * **목록으로 나열**한다 — 각 행은 썸네일·제목과 그 밑의 별 1~5. `items` 순서 그대로 그린다.
 *
 * [이번 주 그만 보기]는 세 번째 선택지라 버튼 줄이 아니라 제목 줄 오른쪽 위 작은 회색 글자다(재생 확인 팝업과 같은 자리).
 */
export default function DripFeedbackDialog({
  isVisible,
  items,
  starsByContentId,
  isSending,
  hasSendError,
  onStarsChange,
  onSend,
  onClose,
  onMuteThisWeek,
}: DripFeedbackDialogProps) {
  const hasAnyRating = items.some((item) => starsByContentId[item.contentId] !== undefined);
  return (
    <ConfirmDialog
      isVisible={isVisible}
      title={COPY.title}
      titleAccessory={
        <Pressable
          style={styles.muteButton}
          onPress={onMuteThisWeek}
          disabled={isSending}
          hitSlop={theme.spacing.sm}
          accessibilityRole="button"
          accessibilityLabel={COPY.muteThisWeek}
          accessibilityState={{ disabled: isSending }}
        >
          <Text style={styles.muteLabel}>{COPY.muteThisWeek}</Text>
        </Pressable>
      }
      secondaryAction={{ label: COPY.close, onPress: onClose, disabled: isSending }}
      primaryAction={{
        label: hasSendError ? COPY.retry : COPY.send,
        onPress: onSend,
        // 한 편도 안 매겼으면 보낼 것이 없다 — 닫기·그만 보기는 따로 있다
        disabled: !hasAnyRating,
        isBusy: isSending,
      }}
      onCloseRequest={onClose}
    >
      <View style={styles.list}>
        {items.map((item) => (
          <DripFeedbackRow
            key={item.contentId}
            item={item}
            stars={starsByContentId[item.contentId]}
            isDisabled={isSending}
            onStarsChange={onStarsChange}
          />
        ))}
      </View>
      {hasSendError ? (
        <Text style={styles.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {COPY.sendFailed}
        </Text>
      ) : null}
    </ConfirmDialog>
  );
}

interface DripFeedbackRowProps {
  item: DripFeedbackItem;
  stars: number | undefined;
  isDisabled: boolean;
  onStarsChange: (contentId: string, stars: number) => void;
}

function DripFeedbackRow({ item, stars, isDisabled, onStarsChange }: DripFeedbackRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.summary}>
        {/* 프레임이 라운드·클립한다 — expo-image 는 연속 곡률을 모른다(design.md §2) */}
        <View style={styles.thumbnailFrame}>
          {item.thumbnailUrl !== null ? (
            <RemoteImage uri={item.thumbnailUrl} style={styles.thumbnail} />
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
      </View>
      <View
        style={styles.stars}
        accessibilityRole="radiogroup"
        accessibilityLabel={COPY.ratingGroupA11y(item.title)}
      >
        {DRIP_FEEDBACK_STAR_VALUES.map((value) => {
          const isFilled = stars !== undefined && value <= stars;
          return (
            <Pressable
              key={value}
              style={styles.starButton}
              onPress={() => onStarsChange(item.contentId, value)}
              disabled={isDisabled}
              accessibilityRole="radio"
              accessibilityLabel={COPY.starA11y(value)}
              accessibilityState={{ checked: stars === value, disabled: isDisabled }}
              testID={`drip-feedback-star-${item.contentId}-${value}`}
            >
              <StarIcon
                size={STAR_SIZE}
                isFilled={isFilled}
                color={isFilled ? theme.color.textPrimary : theme.color.textMuted}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** 작은 썸네일 — 시트·미니플레이어와 같은 결(design.md §2 `sm`) */
const THUMBNAIL_SIZE = 48;
/** 별 도형 크기 — 칸은 44pt 터치 타깃(convention.md 3.4) */
const STAR_SIZE = 28;

const styles = StyleSheet.create({
  list: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  row: {
    gap: theme.spacing.xs,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm + theme.spacing.xs,
  },
  thumbnailFrame: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: theme.color.surface,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  stars: {
    flexDirection: 'row',
    // 별 칸의 안쪽 여백만큼 당겨 첫 별을 썸네일 왼쪽 변에 맞춘다
    marginLeft: -(theme.touchTarget.minWidth - STAR_SIZE) / 2,
  },
  starButton: {
    width: theme.touchTarget.minWidth,
    height: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontSize: theme.font.size.sm,
    color: theme.color.danger,
  },
  // 제목 줄의 작은 글자 — 재생 확인 팝업의 [오늘은 그만 보기]와 같은 모양
  muteButton: {
    paddingTop: 4,
  },
  muteLabel: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
});
