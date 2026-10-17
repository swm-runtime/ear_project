import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { pillButton } from '@/shared/ui/pill-button.styles';
import RemoteImage from '@/shared/ui/RemoteImage';
import { Text } from '@/shared/ui/Typography';

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
  /** 해시태그 탭 → 탐색 탭의 `#태그` 검색(KAN-219, uiux 4.1) */
  onTagPress: (tag: string) => void;
}

/** 태그 글자를 누르는 동안 — iOS 시스템 글자 버튼의 눌림(옅어짐)과 같은 처리 */
const TAG_PRESSED_OPACITY = 0.5;

/**
 * CD1·CD2 헤더 — 썸네일 · 제목 · 주제 태그 · 액션 버튼 줄(content-detail.md 4.2).
 * [재생]이 주 액션(primary), [담기]/[삭제]가 보조 액션(outline)이다(uiux 4.1).
 * 주제 칩(사진 알약)은 MVP에서 탭 대상이 아니다 — 탭 가능해 보이는 시각 처리를 하지 않는다.
 * 해시태그는 글자마다 탭하면 탐색 검색(`#태그`)이 열린다(KAN-219).
 */
export default function ContentDetailHeader({
  content,
  isSaved,
  isActionPending,
  onPlayPress,
  onSavePress,
  onDeletePress,
  onTagPress,
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
                  source={topicImageSource({ name: topic.name })}
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
          {/*
            콘텐츠 해시태그(KAN-163) — 주제 칩(사진 알약 = 분류)과 구분되게 배경 없는 '#' 글자 줄. 없으면 줄을 그리지 않는다.
            글자마다 따로 눌리는 버튼이다(KAN-219 — 탭 = 탐색 탭의 `#태그` 검색). 터치 44×44 는 상자가 채우고(design.md §6),
            줄은 위아래로 당겨 보이는 간격을 종전과 비슷하게 둔다. 글자는 자기 Pressable 안에만 있어 형제 위에 겹치지 않는다
          */}
          {content.tags.length > 0 ? (
            <View style={styles.hashtags}>
              {content.tags.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => onTagPress(tag)}
                  style={({ pressed }) => [
                    styles.hashtagButton,
                    pressed ? styles.hashtagPressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={CONTENT_DETAIL_COPY.hashtagSearchA11y(tag)}
                >
                  <Text style={styles.hashtagLabel}>{CONTENT_DETAIL_COPY.hashtag(tag)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {/* 동적 텍스트 200%에서 두 버튼이 폭을 다투면 세로 쌓기를 허용한다(uiux 7장) */}
      <View style={styles.buttonRow}>
        <Pressable
          style={[pillButton.base, pillButton.primary, styles.playButton]}
          onPress={onPlayPress}
          accessibilityRole="button"
          accessibilityLabel={CONTENT_DETAIL_COPY.actions.play}
        >
          <Text style={pillButton.primaryLabel}>{CONTENT_DETAIL_COPY.actions.play}</Text>
        </Pressable>
        {isSaved ? (
          <Pressable
            style={[pillButton.base, pillButton.destructiveSecondary, styles.secondaryButton]}
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
              <Text style={pillButton.destructiveSecondaryLabel}>
                {CONTENT_DETAIL_COPY.actions.delete}
              </Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[pillButton.base, pillButton.secondary, styles.secondaryButton]}
            disabled={isActionPending}
            onPress={onSavePress}
            accessibilityRole="button"
            accessibilityLabel={CONTENT_DETAIL_COPY.actions.saveA11y}
            accessibilityState={{ disabled: isActionPending, busy: isActionPending }}
          >
            {isActionPending ? (
              <ActivityIndicator size="small" color={theme.color.textPrimary} />
            ) : (
              <Text style={pillButton.secondaryLabel}>{CONTENT_DETAIL_COPY.actions.save}</Text>
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
  // 해시태그 — 보조색 글자만(칩 모양을 쓰지 않는다 — 주제 칩과 섞이면 분류인지 내용인지 안 읽힌다)
  hashtags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // 버튼 상자(44)가 키운 높이만큼 위아래를 당긴다 — 글자 위치는 종전 한 줄과 비슷하게, 첫 글자는 제목 시작선에
    marginVertical: -theme.spacing.sm,
    marginLeft: -theme.spacing.xs,
  },
  /** 글자 버튼 — 터치 44×44(design.md §6). 좌우 여백 xs 가 태그 사이 간격이 된다(종전 두 칸 공백 대신) */
  hashtagButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    paddingHorizontal: theme.spacing.xs,
    justifyContent: 'center',
  },
  hashtagPressed: {
    opacity: TAG_PRESSED_OPACITY,
  },
  hashtagLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
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
    color: theme.color.onPhoto,
    textShadowColor: theme.color.photoTextShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  // 크기만 — 모양·색은 공용 알약(pillButton)
  playButton: {
    flexGrow: 1.4,
    flexBasis: 140,
    minHeight: theme.touchTarget.minHeight,
  },
  // 보조 동작은 테두리 없이 연한 면(design.md §5 — 다이얼로그·시트와 같은 규칙, 2026-09-27 PM). 크기만 여기서
  secondaryButton: {
    flexGrow: 1,
    flexBasis: 100,
    minHeight: theme.touchTarget.minHeight,
  },
});
