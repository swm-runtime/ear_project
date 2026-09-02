import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExploreItem } from '../explore.types';

interface ExploreContentRowProps {
  item: ExploreItem;
  /** 행 본문 탭 = 곧장 재생 판정. 상세 화면을 끼우지 않는다(explore-uiux.md 4.1) */
  onPress: (item: ExploreItem) => void;
  onMorePress: (item: ExploreItem) => void;
}

const toMinutes = (durationSec: number): number => Math.max(1, Math.round(durationSec / 60));

/**
 * 콘텐츠 카드 — 라이브러리 아이템 행과 같은 문법(썸네일·제목·출처·저자·길이).
 * 완청은 썸네일 좌상단 체크로 구분한다 — 탐색은 청취 여부와 무관하게 전부 노출되므로
 * 완청 단서가 라이브러리 카드와 동일하게 필요하다(FE 확정 2026-08-07).
 * 담김 배지는 두지 않는다 — 담김 여부는 더보기 시트의 담기/제거 분기로 확인한다
 * (FE 확정 2026-08-07, 정보량 축소). 행에 담기 버튼도 없다(explore.md 4.3).
 */
export default function ExploreContentRow({ item, onPress, onMorePress }: ExploreContentRowProps) {
  const isCompleted = item.library?.status === 'completed';
  const minutes = toMinutes(item.content.durationSec);

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.body}
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.row.a11yLabel({
          title: item.content.title,
          sourceName: item.content.sourceName,
          minutes,
          completed: isCompleted,
        })}
      >
        <View>
          <Image source={{ uri: item.content.thumbnailUrl }} style={styles.thumbnail} />
          {isCompleted ? (
            <View style={styles.completedMark}>
              <Text style={styles.completedGlyph}>✓</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {item.content.title}
          </Text>
          {/* 제목 → 출처·저자 → 시간 세 줄. 라이브러리·온보딩 카드와 같은 배열이다(2026-09-02) */}
          <Text style={styles.meta} numberOfLines={1}>
            {item.content.sourceName} · {item.content.authorName}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {EXPLORE_COPY.row.durationLabel(minutes)}
          </Text>
        </View>
      </Pressable>
      <Pressable
        style={styles.moreButton}
        onPress={() => onMorePress(item)}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.row.moreA11y}
      >
        <Text style={styles.moreGlyph}>⋯</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  /*
   * ⋯를 흐름에서 빼 우상단에 띄운다 — 흐름에 두면 본문이 ⋯ 왼쪽(44px 앞)에서 끝나
   * 아래 출처·저자의 오른쪽 선이 ⋯보다 안쪽으로 들어간다. 둘 다 컨텐트 박스 오른쪽
   * 끝에 붙어야 같은 여백으로 읽힌다(2026-09-02)
   */
  container: {
    position: 'relative',
    marginHorizontal: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
  },
  body: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  // 글 두 줄(제목+메타)보다 아트워크가 훨씬 높으면 위아래가 빈다 — 88에서 낮췄다(2026-09-02)
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.background,
  },
  completedMark: {
    position: 'absolute',
    top: -theme.spacing.xs,
    left: -theme.spacing.xs,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.color.surface,
  },
  completedGlyph: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.color.onPrimary,
  },
  info: {
    flex: 1,
    gap: theme.spacing.xs,
    justifyContent: 'center',
  },
  meta: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  title: {
    // 우상단에 뜬 ⋯ 아래로 글자가 파고들지 않게 자리를 비운다
    paddingRight: theme.spacing.xl,
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  moreButton: {
    position: 'absolute',
    top: theme.spacing.sm,
    // 절대 위치의 기준은 **패딩 박스**라 right:0이면 컨테이너 패딩을 건너뛰고 카드 끝에
    // 붙는다. 패딩과 같은 값을 줘야 아래 출처·저자와 같은 선이 된다
    right: theme.spacing.md,
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  moreGlyph: {
    fontSize: theme.font.size.lg,
    color: theme.color.textSecondary,
  },
});
