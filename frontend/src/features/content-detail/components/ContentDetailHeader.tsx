import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import RemoteImage from '@/shared/ui/RemoteImage';

import { topicImageSource } from '@/features/interest';

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
        <RemoteImage uri={content.thumbnailUrl} style={styles.thumbnail} />
        <View style={styles.titleArea}>
          <Text style={styles.title} accessibilityRole="header">
            {content.title}
          </Text>
          <View style={styles.chips}>
            {content.topics.map((topic) => (
              <View key={topic.id} style={styles.chip}>
                {/* 주제 사진 알약 — 온보딩·탐색·필터와 같은 문법(design.md 주제 칩). 고를 수 없는 표시라 선택 상태는 없다 */}
                <Image
                  source={topicImageSource(topic.name)}
                  resizeMode="cover"
                  style={styles.chipPhoto}
                />
                <View style={styles.chipOverlay} />
                <Text style={styles.chipLabel} numberOfLines={1}>
                  {topic.name}
                </Text>
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
            style={styles.secondaryButton}
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
    borderCurve: 'continuous',
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
  /*
   * 프로필의 관심 주제 카드 칩과 같은 값(높이 30 · 라벨 여백 md) — xs 라벨의 작은 사진 알약은 그쪽에서 검증됐다.
   * 클리핑은 알약이 한 번만 하고, **칩에 패딩을 주지 않는다**(사진의 `100%` 가 콘텐츠 박스로 풀려 가장자리에
   * 배경이 드러난다) — 좌우 여백은 라벨이 갖는다
   */
  chip: {
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
    overflow: 'hidden',
  },
  /** 사진 — inset 과 퍼센트 크기를 함께 준다(웹은 inset 만으로 원본 800×320 이 남는다) */
  chipPhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  /**
   * 막 — 프로필 관심 주제 칩과 같은 `photoScrim`(0.62). 온보딩 칩의 기본값(0.34)보다 짙은 이유는 둘이다:
   * 라벨이 xs 로 절반이고, 칩이 낮아 사진의 밝은 한 구역이 알약을 통째로 채운다(2026-09-17 실측)
   */
  chipOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.color.photoScrim,
  },
  chipLabel: {
    // 칩이 아니라 라벨이 좌우 여백을 갖는다 — 위 chip 주석 참고
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: theme.color.onPrimary,
    textShadowColor: theme.color.photoTextShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
    borderCurve: 'continuous',
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
    borderCurve: 'continuous',
    // 보조 동작은 테두리 없이 연한 면(design.md §5 — 다이얼로그·시트와 같은 규칙, 2026-09-27 PM)
    backgroundColor: theme.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  /*
   * 삭제 변형 — 테두리를 걷었으므로(위 secondaryButton) 위험 표시는 **빨간 글자**가 맡는다. 빨간 면으로 채우면
   * 검정 [재생]보다 더 눈에 띄어 주 동작이 뒤바뀐다(library-uiux.md 4.7 은 위험색만 요구한다)
   */
  deleteLabel: {
    color: theme.color.danger,
  },
});
