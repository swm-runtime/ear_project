import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { LIBRARY_COPY } from '../library.copy';
import type { LibraryItem } from '../library.types';

interface MoreActionsSheetProps {
  item: LibraryItem | null;
  onDelete: (item: LibraryItem) => void;
  onDismiss: () => void;
}

/**
 * L4 더보기 액션시트 — 메뉴 항목은 삭제 하나뿐이다(library-uiux.md 4.7).
 * 어느 아이템에 대한 조작인지 시트 상단에 반드시 다시 보여준다.
 */
export default function MoreActionsSheet({ item, onDelete, onDismiss }: MoreActionsSheetProps) {
  return (
    <Modal visible={item !== null} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.dim} onPress={onDismiss} accessibilityLabel="닫기" />
      {item ? (
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.content.title}
          </Text>
          <Pressable
            style={styles.deleteButton}
            onPress={() => onDelete(item)}
            accessibilityRole="button"
            accessibilityLabel={LIBRARY_COPY.moreSheet.delete}
          >
            <Text style={styles.deleteLabel}>{LIBRARY_COPY.moreSheet.delete}</Text>
          </Pressable>
          <Pressable
            style={styles.closeButton}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={LIBRARY_COPY.moreSheet.close}
          >
            <Text style={styles.closeLabel}>{LIBRARY_COPY.moreSheet.close}</Text>
          </Pressable>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    flex: 1,
    backgroundColor: theme.color.overlay,
  },
  sheet: {
    backgroundColor: theme.color.background,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.color.border,
    marginBottom: theme.spacing.sm,
  },
  itemTitle: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  deleteButton: {
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
  },
  deleteLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.danger,
  },
  closeButton: {
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
});
