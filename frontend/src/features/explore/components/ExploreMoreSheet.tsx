import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { IS_SHARE_ENABLED, SHARE_COPY } from '@/features/share';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExploreItem } from '../explore.types';

interface ExploreMoreSheetProps {
  item: ExploreItem | null;
  onDetail: (item: ExploreItem) => void;
  onSourceLink: (item: ExploreItem) => void;
  onSave: (item: ExploreItem) => void;
  onRemove: (item: ExploreItem) => void;
  onShare: (item: ExploreItem) => void;
  onDismiss: () => void;
  /** 시트가 완전히 닫힌 뒤(iOS Modal onDismiss) — 보류된 공유 실행용(useDeferredSheetShare) */
  onDismissed: () => void;
}

/**
 * E12 더보기 액션시트 — 대상 요약 + 상세 정보 + 원문 보기 + 담기/제거 + 공유(P1) + 닫기
 * (explore-uiux.md 4.4 — 세 화면 더보기 통일: [원문 보기] 2026-08-10 · [상세 정보] 2026-08-23 ·
 * [공유] share.md 2). [공유]는 MVP 빌드에 행 자체가 없다(share-uiux.md 4.1 — 비활성 노출도
 * 금지). [원문 보기]는 source_url이 있는 콘텐츠(partner)만 노출하고 없으면 행 자체를 그리지
 * 않는다(PL7과 같은 규칙).
 * 어느 콘텐츠에 대한 조작인지 상단에 다시 보여준다(library-uiux.md 4.7과 같은 규칙).
 */
export default function ExploreMoreSheet({
  item,
  onDetail,
  onSourceLink,
  onSave,
  onRemove,
  onShare,
  onDismiss,
  onDismissed,
}: ExploreMoreSheetProps) {
  const isSaved = item?.library !== null;

  return (
    <Modal
      visible={item !== null}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      onDismiss={onDismissed}
    >
      <Pressable style={styles.dim} onPress={onDismiss} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {item ? (
            <>
              <View style={styles.summary}>
                <Image source={{ uri: item.content.thumbnailUrl }} style={styles.thumbnail} />
                <View style={styles.summaryText}>
                  <Text style={styles.title} numberOfLines={2}>
                    {item.content.title}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.content.sourceName} · {item.content.authorName}
                  </Text>
                </View>
              </View>
              <Pressable
                style={styles.action}
                onPress={() => onDetail(item)}
                accessibilityRole="button"
                accessibilityLabel={EXPLORE_COPY.sheet.detail}
              >
                <Text style={styles.actionLabel}>{EXPLORE_COPY.sheet.detail}</Text>
              </Pressable>
              {item.content.sourceUrl !== null ? (
                <Pressable
                  style={styles.action}
                  onPress={() => onSourceLink(item)}
                  accessibilityRole="button"
                  accessibilityLabel={EXPLORE_COPY.sheet.sourceLink}
                >
                  <Text style={styles.actionLabel}>{EXPLORE_COPY.sheet.sourceLink}</Text>
                </Pressable>
              ) : null}
              {/* 담기/제거는 library 값으로 가른다 — 출처와 무관하게 제거를 허용한다(uiux 4.4) */}
              {isSaved ? (
                <Pressable
                  style={styles.action}
                  onPress={() => onRemove(item)}
                  accessibilityRole="button"
                  accessibilityLabel={EXPLORE_COPY.sheet.remove}
                >
                  {/* 라이브러리에서 빼는 조작 — L4의 [삭제]와 같은 결과이므로 같은 위험색을 쓴다 */}
                  <Text style={[styles.actionLabel, styles.removeLabel]}>
                    {EXPLORE_COPY.sheet.remove}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.action}
                  onPress={() => onSave(item)}
                  accessibilityRole="button"
                  accessibilityLabel={EXPLORE_COPY.sheet.save}
                >
                  <Text style={styles.actionLabel}>{EXPLORE_COPY.sheet.save}</Text>
                </Pressable>
              )}
              {/* [공유] — 담기/제거류 아래, P1에만(SH1). 모든 콘텐츠에 노출되는 무조건부 행이다 */}
              {IS_SHARE_ENABLED ? (
                <Pressable
                  style={styles.action}
                  onPress={() => onShare(item)}
                  accessibilityRole="button"
                  accessibilityLabel={SHARE_COPY.action}
                >
                  <Text style={styles.actionLabel}>{SHARE_COPY.action}</Text>
                </Pressable>
              ) : null}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    flex: 1,
    backgroundColor: theme.color.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.color.background,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.border,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
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
  meta: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
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
  removeLabel: {
    color: theme.color.danger,
    fontWeight: '600',
  },
  closeLabel: {
    color: theme.color.textSecondary,
  },
});
