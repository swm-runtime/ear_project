import { ActivityIndicator, Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import BottomSheet from '@/shared/ui/BottomSheet';
import { pillButton } from '@/shared/ui/pill-button.styles';
import RemoteImage from '@/shared/ui/RemoteImage';
import StarIcon from '@/shared/ui/StarIcon';
import { Text, TextInput } from '@/shared/ui/Typography';

import {
  CONTENT_REVIEW_STAR_VALUES,
  CONTENT_REVIEW_TEXT_MAX_LENGTH,
} from '../content-review.constants';
import { CONTENT_REVIEW_COPY } from '../content-review.copy';
import type { ContentReviewTarget, RewardProgress } from '../content-review.types';
import { useSheetKeyboardInset } from '../hooks/useSheetKeyboardInset';

export interface ContentReviewSheetProps {
  isVisible: boolean;
  /** `review` 후기 시트(L17) · `prompt` 먼저 묻는 시트(L18 — 제목이 다르고 [이번 주 그만 보기]가 있다) */
  variant: 'review' | 'prompt';
  /** 후기를 남길 편 — 닫힌 뒤에도 쥐고 있어 퇴장 모션 동안 내용이 비지 않는다(쓰는 쪽이 지운다) */
  target: ContentReviewTarget | null;
  stars: number | null;
  text: string;
  /** 이미 쓴 편 — 주 동작이 [수정하기] */
  isEditing: boolean;
  rewardProgress: RewardProgress | null;
  isSending: boolean;
  hasSendError: boolean;
  onStarsChange: (stars: number) => void;
  onTextChange: (text: string) => void;
  onSend: () => void;
  /** [닫기] · 딤 탭 · 끌어 닫기 · 뒤로가기 */
  onClose: () => void;
  /** L18 [이번 주 그만 보기] */
  onMuteThisWeek?: () => void;
  /** 시트가 실제로 내려간 뒤(iOS 모달 dismiss 완료 · Android 숨김 커밋) — 발급 안내 시트는 이 뒤에 연다(모달 겹침 금지) */
  onClosed: () => void;
}

const COPY = CONTENT_REVIEW_COPY.sheet;

/**
 * 후기 시트(L17) · 먼저 묻는 시트(L18)의 공통 몸체 — library-uiux.md 4.13 · 4.14.
 * 썸네일 · 제목 / 별 1~5(필수) / 글(선택, n/500) / 보상 줄(서버가 진행 값을 줄 때만) / [보내기] · [닫기].
 * 보낼지 · 발급할지 · 쓸 수 있는 편인지는 서버가 정한다 — 이 시트는 입력과 표시만 한다.
 */
export default function ContentReviewSheet({
  isVisible,
  variant,
  target,
  stars,
  text,
  isEditing,
  rewardProgress,
  isSending,
  hasSendError,
  onStarsChange,
  onTextChange,
  onSend,
  onClose,
  onMuteThisWeek,
  onClosed,
}: ContentReviewSheetProps) {
  const { containerRef: keyboardContainerRef, inset: keyboardInset } =
    useSheetKeyboardInset(isVisible);
  const canSend = stars !== null && !isSending;
  const primaryLabel = hasSendError ? COPY.retry : isEditing ? COPY.update : COPY.send;

  const close = () => {
    Keyboard.dismiss();
    onClose();
  };
  const send = () => {
    if (!canSend) return;
    Keyboard.dismiss();
    onSend();
  };

  return (
    <BottomSheet
      isVisible={isVisible}
      onRequestClose={close}
      onClosed={Platform.OS === 'ios' ? onClosed : undefined}
      onHidden={Platform.OS !== 'ios' ? onClosed : undefined}
      sheetStyle={styles.sheet}
    >
      <View
        ref={keyboardContainerRef}
        style={{ paddingBottom: keyboardInset }}
        accessibilityViewIsModal
      >
        {target !== null ? (
          <>
            <View style={styles.titleRow}>
              <Text style={styles.sheetTitle} accessibilityRole="header">
                {variant === 'prompt' ? COPY.promptTitle : COPY.title}
              </Text>
              {variant === 'prompt' && onMuteThisWeek ? (
                <Pressable
                  style={styles.muteButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    onMuteThisWeek();
                  }}
                  disabled={isSending}
                  hitSlop={theme.spacing.sm}
                  accessibilityRole="button"
                  accessibilityLabel={COPY.muteThisWeek}
                  accessibilityState={{ disabled: isSending }}
                >
                  <Text style={styles.muteLabel}>{COPY.muteThisWeek}</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.summary}>
              {/* 프레임이 라운드 · 클립한다 — expo-image 는 연속 곡률을 모른다(design.md §2) */}
              <View style={styles.thumbnailFrame}>
                {target.thumbnailUrl !== null ? (
                  <RemoteImage uri={target.thumbnailUrl} style={styles.thumbnail} />
                ) : null}
              </View>
              <Text style={styles.contentTitle} numberOfLines={2}>
                {target.title}
              </Text>
            </View>

            <View
              style={styles.stars}
              accessibilityRole="radiogroup"
              accessibilityLabel={COPY.ratingGroupA11y(target.title)}
            >
              {CONTENT_REVIEW_STAR_VALUES.map((value) => {
                const isFilled = stars !== null && value <= stars;
                return (
                  <Pressable
                    key={value}
                    style={styles.starButton}
                    onPress={() => onStarsChange(value)}
                    disabled={isSending}
                    accessibilityRole="radio"
                    accessibilityLabel={COPY.starA11y(value)}
                    accessibilityState={{ checked: stars === value, disabled: isSending }}
                    testID={`content-review-star-${value}`}
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

            <View style={styles.inputBlock}>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={onTextChange}
                placeholder={COPY.placeholder}
                placeholderTextColor={theme.color.textMuted}
                multiline
                maxLength={CONTENT_REVIEW_TEXT_MAX_LENGTH}
                editable={!isSending}
                textAlignVertical="top"
                accessibilityLabel={COPY.textA11y}
                testID="content-review-text"
              />
              <Text
                style={styles.counter}
                accessibilityLabel={COPY.counterA11y(text.length, CONTENT_REVIEW_TEXT_MAX_LENGTH)}
              >
                {COPY.counter(text.length, CONTENT_REVIEW_TEXT_MAX_LENGTH)}
              </Text>
            </View>

            {rewardProgress !== null ? (
              <Text style={styles.reward}>
                {COPY.rewardLine(rewardProgress.current, rewardProgress.required)}
              </Text>
            ) : null}

            {hasSendError ? (
              <Text style={styles.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
                {COPY.sendFailed}
              </Text>
            ) : null}

            <Pressable
              style={[
                pillButton.base,
                pillButton.primary,
                styles.primary,
                !canSend && styles.primaryDisabled,
              ]}
              onPress={send}
              // 별을 고르기 전엔 보낼 수 없다 — 별이 필수다(content-review.md 3장)
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel={primaryLabel}
              accessibilityState={{ disabled: !canSend, busy: isSending }}
              testID="content-review-send"
            >
              {isSending ? (
                <ActivityIndicator color={theme.color.onPrimary} />
              ) : (
                <Text style={pillButton.primaryLabel}>{primaryLabel}</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.closeButton}
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel={COPY.close}
            >
              <Text style={styles.closeLabel}>{COPY.close}</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

/** 작은 썸네일 — 더보기 시트 · 추천 별점 팝업과 같은 결(design.md §2 `sm`) */
const THUMBNAIL_SIZE = 48;
/** 별 도형 크기 — 칸은 44pt 터치 타깃(convention.md 3.4). 시트는 별이 주인공이라 팝업(28)보다 크다 */
const STAR_SIZE = 32;
/** 글 칸 — 세 줄쯤 보이고, 넘치면 칸 안에서 스크롤한다(시트가 화면을 다 덮지 않게) */
const INPUT_MIN_HEIGHT = 96;
const INPUT_MAX_HEIGHT = 160;

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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  sheetTitle: {
    flex: 1,
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  // 제목 줄의 작은 글자 — 추천 별점 팝업의 [이번 주 그만 보기]와 같은 모양
  muteButton: {
    paddingTop: 4,
  },
  muteLabel: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm + theme.spacing.xs,
    marginTop: theme.spacing.md,
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
  contentTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  stars: {
    flexDirection: 'row',
    marginTop: theme.spacing.sm,
    // 별 칸의 안쪽 여백만큼 당겨 첫 별을 썸네일 왼쪽 변에 맞춘다
    marginLeft: -(theme.touchTarget.minWidth - STAR_SIZE) / 2,
  },
  starButton: {
    width: theme.touchTarget.minWidth,
    height: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputBlock: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  input: {
    minHeight: INPUT_MIN_HEIGHT,
    maxHeight: INPUT_MAX_HEIGHT,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm + theme.spacing.xs,
    paddingBottom: theme.spacing.sm + theme.spacing.xs,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  counter: {
    alignSelf: 'flex-end',
    fontSize: theme.font.size.xs,
    fontVariant: ['tabular-nums'],
    color: theme.color.textSecondary,
  },
  reward: {
    marginTop: theme.spacing.sm,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  error: {
    marginTop: theme.spacing.sm,
    fontSize: theme.font.size.sm,
    color: theme.color.danger,
  },
  primary: {
    marginTop: theme.spacing.md,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  /** 비활성 — 별 전 · 보내는 중. 검정을 흐리지 않고 회색 면으로 내린다(코드 입력 [확인]과 같다) */
  primaryDisabled: {
    backgroundColor: theme.color.fillMuted,
  },
  closeButton: {
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xs,
  },
  closeLabel: {
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
});
