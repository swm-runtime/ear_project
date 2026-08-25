import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { IS_SHARE_ENABLED, SHARE_COPY } from '@/features/share';

import { PLAYER_COPY } from '../player.copy';
import { formatPlaybackTime } from '../player.format';

interface PlayerMoreSheetProps {
  isVisible: boolean;
  /** 대상 요약 — 딤 처리된 화면 대신 삭제 대상을 눈으로 확인시킨다(player-uiux.md 4.7) */
  summary: {
    title: string | null;
    authorName: string | null;
    sourceName: string | null;
    thumbnailUrl: string | null;
    durationSec: number;
  };
  /** null이면 [원문 보기] 행 자체를 그리지 않는다(비활성 노출 금지 — uiux 8장) */
  sourceUrl: string | null;
  /** 라이브러리에 없는 콘텐츠면 삭제 행을 그리지 않는다 */
  canDelete: boolean;
  onDetailPress: () => void;
  onSourceLinkPress: () => void;
  onDeletePress: () => void;
  onSharePress: () => void;
  onClose: () => void;
  /** 시트가 완전히 닫힌 뒤(iOS Modal onDismiss) — 보류된 공유 실행용(useDeferredSheetShare) */
  onDismissed: () => void;
}

/**
 * PL7 더보기 시트 — 라이브러리 L4·탐색 E12와 같은 시트 문법. [공유]는 P1에만 노출되고
 * MVP 빌드에는 행 자체가 없다(share.md 2 · share-uiux.md 4.1 — 비활성 노출도 금지).
 * 공유해도 재생은 유지된다(share.md 2).
 * [상세 정보] 추가(2026-08-23 — player-uiux.md 4.7): 탭하면 시트가 닫히고 상세 화면으로
 * 이동하되 재생은 유지된다(content-detail.md 2장).
 */
export default function PlayerMoreSheet({
  isVisible,
  summary,
  sourceUrl,
  canDelete,
  onDetailPress,
  onSourceLinkPress,
  onDeletePress,
  onSharePress,
  onClose,
  onDismissed,
}: PlayerMoreSheetProps) {
  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismissed}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable style={styles.sheet} accessible={false}>
          <View style={styles.handle} />
          <View accessibilityViewIsModal>
            <View style={styles.summary}>
              {summary.thumbnailUrl ? (
                <Image source={{ uri: summary.thumbnailUrl }} style={styles.thumbnail} />
              ) : (
                <View style={[styles.thumbnail, styles.thumbnailPlaceholder]} />
              )}
              <View style={styles.summaryText}>
                <Text style={styles.title} numberOfLines={2}>
                  {summary.title ?? ''}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {[summary.sourceName, summary.authorName, formatPlaybackTime(summary.durationSec)]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
            <Pressable
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              onPress={onDetailPress}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.moreSheet.detail}
            >
              <Text style={styles.actionLabel}>{PLAYER_COPY.moreSheet.detail}</Text>
            </Pressable>
            {sourceUrl !== null ? (
              <Pressable
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
                onPress={onSourceLinkPress}
                accessibilityRole="button"
                accessibilityLabel={PLAYER_COPY.moreSheet.sourceLink}
              >
                <Text style={styles.actionLabel}>{PLAYER_COPY.moreSheet.sourceLink}</Text>
              </Pressable>
            ) : null}
            {canDelete ? (
              <Pressable
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
                onPress={onDeletePress}
                accessibilityRole="button"
                accessibilityLabel={PLAYER_COPY.moreSheet.delete}
              >
                {/* 라이브러리에서 빼는 조작은 세 화면 모두 위험색이다(uiux 4.7) */}
                <Text style={[styles.actionLabel, styles.actionLabelDanger]}>
                  {PLAYER_COPY.moreSheet.delete}
                </Text>
              </Pressable>
            ) : null}
            {/* [공유] — 담기/제거류 아래, P1에만(SH1). 담김·재생과 무관한 무조건부 행이다 */}
            {IS_SHARE_ENABLED ? (
              <Pressable
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
                onPress={onSharePress}
                accessibilityRole="button"
                accessibilityLabel={SHARE_COPY.action}
              >
                <Text style={styles.actionLabel}>{SHARE_COPY.action}</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.moreSheet.close}
            >
              <Text style={styles.actionLabel}>{PLAYER_COPY.moreSheet.close}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.color.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    backgroundColor: theme.color.background,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.color.border,
    marginBottom: theme.spacing.sm,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
  thumbnailPlaceholder: {
    backgroundColor: theme.color.surface,
  },
  summaryText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  title: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  subtitle: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.color.border,
    marginVertical: theme.spacing.xs,
  },
  action: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  actionPressed: {
    backgroundColor: theme.color.surface,
  },
  actionLabel: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  actionLabelDanger: {
    color: theme.color.danger,
  },
});
