import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { LIBRARY_COPY } from '../library.copy';
import type { LibrarySourceFilter, LibraryTopic } from '../library.types';

const SOURCE_OPTIONS: LibrarySourceFilter[] = ['drip', 'save'];

interface TopicFilterSheetProps {
  visible: boolean;
  topics: LibraryTopic[];
  isLoading: boolean;
  appliedTopicIds: string[];
  appliedSourceFilter: LibrarySourceFilter | null;
  /** [적용]으로만 반영된다. 딤·뒤로가기는 변경 폐기(library-uiux.md 4.5) */
  onApply: (selected: LibraryTopic[], sourceFilter: LibrarySourceFilter | null) => void;
  onDismiss: () => void;
}

/**
 * L2 필터 바텀시트 — 출처(이어 PICK/담은 콘텐츠) + 주제(라이브러리에 실제로 담긴 것만).
 * 부모가 열 때마다 key를 바꿔 재마운트한다 — 지난번 폐기된 변경이 초안에 남지 않게.
 */
export default function TopicFilterSheet({
  visible,
  topics,
  isLoading,
  appliedTopicIds,
  appliedSourceFilter,
  onApply,
  onDismiss,
}: TopicFilterSheetProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(appliedTopicIds);
  const [sourceDraft, setSourceDraft] = useState<LibrarySourceFilter | null>(appliedSourceFilter);

  const toggle = (topicId: string) => {
    setSelectedIds((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId],
    );
  };

  // 출처는 상호 배타 단일 선택 — 같은 것을 다시 누르면 해제된다
  const toggleSource = (source: LibrarySourceFilter) => {
    setSourceDraft((prev) => (prev === source ? null : source));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.dim} onPress={onDismiss} accessibilityLabel="닫기" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{LIBRARY_COPY.topicFilter.sheetTitle}</Text>

        <Text style={styles.sectionTitle}>{LIBRARY_COPY.sourceFilter.sectionTitle}</Text>
        <View style={styles.chipWrap}>
          {SOURCE_OPTIONS.map((source) => {
            const isSelected = sourceDraft === source;
            return (
              <Pressable
                key={source}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => toggleSource(source)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={LIBRARY_COPY.sourceFilter[source]}
              >
                <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
                  {LIBRARY_COPY.sourceFilter[source]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>{LIBRARY_COPY.topicFilter.title}</Text>
        <Text style={styles.helper}>{LIBRARY_COPY.topicFilter.helper}</Text>

        {isLoading ? (
          <ActivityIndicator style={styles.loading} color={theme.color.primary} />
        ) : (
          <View style={styles.chipWrap}>
            {topics.map((topic) => {
              const isSelected = selectedIds.includes(topic.id);
              return (
                <Pressable
                  key={topic.id}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => toggle(topic.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={topic.name}
                >
                  <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
                    {topic.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.buttonRow}>
          <Pressable
            style={styles.resetButton}
            // [초기화]는 선택만 비우고 시트를 닫지 않는다(library-uiux.md 4.5)
            onPress={() => {
              setSelectedIds([]);
              setSourceDraft(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={LIBRARY_COPY.topicFilter.reset}
          >
            <Text style={styles.resetLabel}>{LIBRARY_COPY.topicFilter.reset}</Text>
          </Pressable>
          <Pressable
            style={styles.applyButton}
            onPress={() =>
              onApply(
                topics.filter((t) => selectedIds.includes(t.id)),
                sourceDraft,
              )
            }
            accessibilityRole="button"
            accessibilityLabel={LIBRARY_COPY.topicFilter.apply}
          >
            <Text style={styles.applyLabel}>{LIBRARY_COPY.topicFilter.apply}</Text>
          </Pressable>
        </View>
      </View>
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
  title: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  sectionTitle: {
    marginTop: theme.spacing.sm,
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  helper: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  loading: {
    marginVertical: theme.spacing.lg,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.md,
  },
  chip: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.background,
  },
  chipSelected: {
    borderColor: theme.color.primary,
    backgroundColor: theme.color.surface,
  },
  chipLabel: {
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  chipLabelSelected: {
    color: theme.color.primary,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  resetButton: {
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  resetLabel: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  applyButton: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
  },
  applyLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
