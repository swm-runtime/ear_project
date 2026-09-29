import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import BottomSheet from '@/shared/ui/BottomSheet';
import RemoteImage from '@/shared/ui/RemoteImage';
import { Text } from '@/shared/ui/Typography';

import { useTopicsQuery } from '@/features/interest';
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
  /**
   * **내려가는 동안 보여 줄 내용.** 닫기는 `item` 을 null 로 만드는데, 그러면 시트가 내려가기 전에 내용이
   * 먼저 사라져 빈 상자만 미끄러진다(PM 2026-09-27 21:00 "내려갈 때 애니메이션이 이상하다"). 마지막으로
   * 열렸던 항목을 붙잡아 두고, 보일지 여부만 `item` 이 정한다. 렌더 중 갱신은 React 가 권하는 파생 상태 패턴이다
   */
  const [shown, setShown] = useState(item);
  if (item !== null && item !== shown) setShown(item);

  // 제목 밑 한 줄 — `카테고리 · N분`(미니플레이어와 같은 주제 이름 규칙: 앞 둘까지). 주제 목록이 아직 없으면 길이만
  const topicsQuery = useTopicsQuery();
  const metaLine = shown
    ? [
        shown.content.topicIds
          .map((id) => topicsQuery.data?.items.find((topic) => topic.topicId === id)?.name)
          .filter((name): name is string => name !== undefined)
          .slice(0, 2)
          .join(' · '),
        EXPLORE_COPY.row.durationLabel(Math.max(1, Math.round(shown.content.durationSec / 60))),
      ]
        .filter((part) => part.length > 0)
        .join(' · ')
    : '';

  const isSaved = shown?.library !== null;

  return (
    <BottomSheet
      isVisible={item !== null}
      onRequestClose={onDismiss}
      onClosed={onDismissed}
      sheetStyle={styles.sheet}
    >
      <View accessibilityViewIsModal>
        {shown ? (
          <>
            <View style={styles.summary}>
              <RemoteImage uri={shown.content.thumbnailUrl} style={styles.thumbnail} />
              <View style={styles.summaryText}>
                <Text style={styles.title} numberOfLines={2}>
                  {shown.content.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {metaLine}
                </Text>
              </View>
            </View>
            <Pressable
              style={styles.action}
              onPress={() => onDetail(shown)}
              accessibilityRole="button"
              accessibilityLabel={EXPLORE_COPY.sheet.detail}
            >
              <Text style={styles.actionLabel}>{EXPLORE_COPY.sheet.detail}</Text>
            </Pressable>
            {shown.content.sourceUrl !== null ? (
              <Pressable
                style={styles.action}
                onPress={() => onSourceLink(shown)}
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
                onPress={() => onRemove(shown)}
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
                onPress={() => onSave(shown)}
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
                onPress={() => onShare(shown)}
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
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: theme.color.background,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: 'continuous',
    paddingVertical: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    // 구분선 없이 여백으로 요약과 액션을 가른다(PM 2026-09-27 23:27 — 액션 줄 사이엔 선이 없어 이 선 하나만 튀었다)
    paddingBottom: theme.spacing.lg,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
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
