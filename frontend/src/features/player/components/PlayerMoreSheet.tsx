import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import BottomSheet from '@/shared/ui/BottomSheet';
import RemoteImage from '@/shared/ui/RemoteImage';
import { Text } from '@/shared/ui/Typography';

import { IS_SHARE_ENABLED, SHARE_COPY } from '@/features/share';

import { PLAYER_COPY } from '../player.copy';
import { playerColor } from '../player.theme';

interface PlayerMoreSheetProps {
  isVisible: boolean;
  /** 대상 요약 — 딤 처리된 화면 대신 삭제 대상을 눈으로 확인시킨다(player-uiux.md 4.7) */
  summary: {
    title: string | null;
    thumbnailUrl: string | null;
    durationSec: number;
    /** 주제 이름 앞 둘(`A · B`) — 플레이어 제목 밑 줄과 같은 값. 못 찾으면 null(길이만 보인다) */
    categoryLabel: string | null;
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
 * PL7 더보기 시트 — 라이브러리 L4·탐색 E12와 같은 시트 문법. **배치·여백·글자는 L4 와 같고 색만 플레이어 팔레트**다
 * (PM 2026-09-27 23:44 "일반 썸네일 점 3개 UI랑 맞춰" — 손잡이·구분선 제거, `카테고리 · N분`, 좌우 여백 md 한 줄). [공유]는 P1에만 노출되고
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
    <BottomSheet
      isVisible={isVisible}
      onRequestClose={onClose}
      onClosed={onDismissed}
      sheetStyle={styles.sheet}
      dimColor={playerColor.overlay}
    >
      <View accessible={false}>
        <View accessibilityViewIsModal>
          <View style={styles.summary}>
            {summary.thumbnailUrl ? (
              <RemoteImage uri={summary.thumbnailUrl} style={styles.thumbnail} />
            ) : (
              <View style={[styles.thumbnail, styles.thumbnailPlaceholder]} />
            )}
            <View style={styles.summaryText}>
              <Text style={styles.title} numberOfLines={2}>
                {summary.title ?? ''}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {[
                  summary.categoryLabel,
                  PLAYER_COPY.moreSheet.durationLabel(
                    Math.max(1, Math.round(summary.durationSec / 60)),
                  ),
                ]
                  .filter((part): part is string => part !== null)
                  .join(' · ')}
              </Text>
            </View>
          </View>
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
            <Text style={[styles.actionLabel, styles.closeLabel]}>
              {PLAYER_COPY.moreSheet.close}
            </Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: 'continuous',
    backgroundColor: playerColor.background,
    paddingVertical: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  // 요약·액션 모두 좌우 md 한 줄 — 구분선 없이 여백 lg 로 가른다(L4·E12 와 같은 값)
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    backgroundColor: playerColor.surface,
  },
  thumbnailPlaceholder: {
    backgroundColor: playerColor.surface,
  },
  summaryText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  title: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: playerColor.textPrimary,
  },
  subtitle: {
    fontSize: theme.font.size.xs,
    color: playerColor.textSecondary,
  },
  action: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  actionPressed: {
    backgroundColor: playerColor.surface,
  },
  actionLabel: {
    fontSize: theme.font.size.md,
    color: playerColor.textPrimary,
  },
  actionLabelDanger: {
    color: playerColor.danger,
    fontWeight: '600',
  },
  closeLabel: {
    color: playerColor.textSecondary,
  },
});
