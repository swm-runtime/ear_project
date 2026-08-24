import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { LIBRARY_COPY } from '../library.copy';
import type { LibraryItem } from '../library.types';

interface MoreActionsSheetProps {
  item: LibraryItem | null;
  onDetail: (item: LibraryItem) => void;
  onSourceLink: (item: LibraryItem) => void;
  onDelete: (item: LibraryItem) => void;
  onDismiss: () => void;
}

/**
 * L4 더보기 액션시트 — 상세 정보·원문 보기·삭제(library-uiux.md 4.7 — 세 화면 더보기 통일:
 * [원문 보기] 2026-08-10 · [상세 정보] 2026-08-23). [원문 보기]는 source_url이 있는
 * 콘텐츠(partner)만 노출하고 없으면 행 자체를 그리지 않는다(PL7과 같은 규칙).
 * 어느 아이템에 대한 조작인지 시트 상단에 반드시 다시 보여준다 — 대상 요약(썸네일·제목·출처)
 * 구성은 탐색 더보기 시트와 통일한다(FE 확정 2026-08-07).
 */
export default function MoreActionsSheet({
  item,
  onDetail,
  onSourceLink,
  onDelete,
  onDismiss,
}: MoreActionsSheetProps) {
  return (
    <Modal visible={item !== null} transparent animationType="slide" onRequestClose={onDismiss}>
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
                accessibilityLabel={LIBRARY_COPY.moreSheet.detail}
              >
                <Text style={styles.actionLabel}>{LIBRARY_COPY.moreSheet.detail}</Text>
              </Pressable>
              {item.content.sourceUrl !== null ? (
                <Pressable
                  style={styles.action}
                  onPress={() => onSourceLink(item)}
                  accessibilityRole="button"
                  accessibilityLabel={LIBRARY_COPY.moreSheet.sourceLink}
                >
                  <Text style={styles.actionLabel}>{LIBRARY_COPY.moreSheet.sourceLink}</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={styles.action}
                onPress={() => onDelete(item)}
                accessibilityRole="button"
                accessibilityLabel={LIBRARY_COPY.moreSheet.delete}
              >
                <Text style={[styles.actionLabel, styles.deleteLabel]}>
                  {LIBRARY_COPY.moreSheet.delete}
                </Text>
              </Pressable>
              <Pressable
                style={styles.action}
                onPress={onDismiss}
                accessibilityRole="button"
                accessibilityLabel={LIBRARY_COPY.moreSheet.close}
              >
                <Text style={[styles.actionLabel, styles.closeLabel]}>
                  {LIBRARY_COPY.moreSheet.close}
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
  deleteLabel: {
    color: theme.color.danger,
    fontWeight: '600',
  },
  closeLabel: {
    color: theme.color.textSecondary,
  },
});
