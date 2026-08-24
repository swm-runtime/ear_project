import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { CONTENT_DETAIL_COPY } from '../content-detail.copy';
import type { ContentDetailContent } from '../content-detail.types';

interface ContentDetailHeaderProps {
  content: ContentDetailContent;
  /** 담김 여부 — 상세 응답의 libraryItem null 판정으로 [담기]/[삭제]를 가른다(4.4) */
  isSaved: boolean;
  /** 담기·삭제 처리 중 — 탭한 버튼을 로딩으로 바꾸고 중복 탭을 차단한다(uiux 4.3) */
  isActionPending: boolean;
  onPlayPress: () => void;
  onSavePress: () => void;
  onDeletePress: () => void;
}

/**
 * CD1·CD2 헤더 — 썸네일 · 제목 · 주제 태그 · 액션 버튼 줄(content-detail.md 4.2).
 * [재생]이 주 액션(primary), [담기]/[삭제]가 보조 액션(outline)이다(uiux 4.1).
 * 주제 태그는 MVP에서 탭 대상이 아니다 — 탭 가능해 보이는 시각 처리를 하지 않는다.
 */
export default function ContentDetailHeader({
  content,
  isSaved,
  isActionPending,
  onPlayPress,
  onSavePress,
  onDeletePress,
}: ContentDetailHeaderProps) {
  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        {/* 썸네일은 장식 이미지 — 낭독에서 제외한다. 제목이 곧 그 내용이다(uiux 7장) */}
        <Image source={{ uri: content.thumbnailUrl }} style={styles.thumbnail} />
        <View style={styles.titleArea}>
          <Text style={styles.title} accessibilityRole="header">
            {content.title}
          </Text>
          <View style={styles.chips}>
            {content.topics.map((topic) => (
              <View key={topic.id} style={styles.chip}>
                <Text style={styles.chipLabel}>{topic.name}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* 동적 텍스트 200%에서 두 버튼이 폭을 다투면 세로 쌓기를 허용한다(uiux 7장) */}
      <View style={styles.buttonRow}>
        <Pressable
          style={styles.playButton}
          onPress={onPlayPress}
          accessibilityRole="button"
          accessibilityLabel={CONTENT_DETAIL_COPY.actions.play}
        >
          <Text style={styles.playLabel}>{CONTENT_DETAIL_COPY.actions.play}</Text>
        </Pressable>
        {isSaved ? (
          <Pressable
            style={[styles.secondaryButton, styles.deleteButton]}
            disabled={isActionPending}
            onPress={onDeletePress}
            accessibilityRole="button"
            accessibilityLabel={CONTENT_DETAIL_COPY.actions.deleteA11y}
            accessibilityState={{ disabled: isActionPending, busy: isActionPending }}
          >
            {isActionPending ? (
              <ActivityIndicator size="small" color={theme.color.danger} />
            ) : (
              // 라이브러리에서 빼는 조작은 세 화면 모두 위험색이다(library-uiux.md 4.7)
              <Text style={[styles.secondaryLabel, styles.deleteLabel]}>
                {CONTENT_DETAIL_COPY.actions.delete}
              </Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={styles.secondaryButton}
            disabled={isActionPending}
            onPress={onSavePress}
            accessibilityRole="button"
            accessibilityLabel={CONTENT_DETAIL_COPY.actions.saveA11y}
            accessibilityState={{ disabled: isActionPending, busy: isActionPending }}
          >
            {isActionPending ? (
              <ActivityIndicator size="small" color={theme.color.textPrimary} />
            ) : (
              <Text style={styles.secondaryLabel}>{CONTENT_DETAIL_COPY.actions.save}</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: theme.spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
  },
  titleArea: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  chip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.surface,
  },
  chipLabel: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  playButton: {
    flexGrow: 1.4,
    flexBasis: 140,
    minHeight: theme.touchTarget.minHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
  secondaryButton: {
    flexGrow: 1,
    flexBasis: 100,
    minHeight: theme.touchTarget.minHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  deleteButton: {
    borderColor: theme.color.danger,
  },
  deleteLabel: {
    color: theme.color.danger,
  },
});
