import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExploreItem } from '../explore.types';

interface ExploreMoreSheetProps {
  item: ExploreItem | null;
  onSave: (item: ExploreItem) => void;
  onRemove: (item: ExploreItem) => void;
  onDismiss: () => void;
}

/**
 * E12 더보기 액션시트 — MVP 구성은 대상 요약 + 담기/제거 + 닫기가 전부다.
 * [공유]·[상세]를 노출하지 않는다(explore.md 4.6 — MVP 제외 · 상세 명세 부재).
 * 어느 콘텐츠에 대한 조작인지 상단에 다시 보여준다(library-uiux.md 4.7과 같은 규칙).
 */
export default function ExploreMoreSheet({
  item,
  onSave,
  onRemove,
  onDismiss,
}: ExploreMoreSheetProps) {
  const isSaved = item?.library !== null;

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
