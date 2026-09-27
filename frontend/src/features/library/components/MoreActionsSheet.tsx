import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import BottomSheet from '@/shared/ui/BottomSheet';
import RemoteImage from '@/shared/ui/RemoteImage';

import { useTopicsQuery } from '@/features/interest';
import { IS_SHARE_ENABLED, SHARE_COPY } from '@/features/share';

import { LIBRARY_COPY } from '../library.copy';
import type { LibraryItem } from '../library.types';

interface MoreActionsSheetProps {
  item: LibraryItem | null;
  onDetail: (item: LibraryItem) => void;
  onSourceLink: (item: LibraryItem) => void;
  onDelete: (item: LibraryItem) => void;
  onShare: (item: LibraryItem) => void;
  onDismiss: () => void;
  /** 시트가 완전히 닫힌 뒤(iOS Modal onDismiss) — 보류된 공유 실행용(useDeferredSheetShare) */
  onDismissed: () => void;
}

/**
 * L4 더보기 액션시트 — 상세 정보·원문 보기·삭제·공유(library-uiux.md 4.7 — 세 화면 더보기
 * 통일: [원문 보기] 2026-08-10 · [상세 정보] 2026-08-23 · [공유] P1, share.md 2). [원문 보기]는
 * source_url이 있는 콘텐츠(partner)만 노출하고 없으면 행 자체를 그리지 않는다(PL7과 같은 규칙).
 * [공유]는 MVP 빌드에 행 자체가 없다(share-uiux.md 4.1 — 비활성 노출도 금지).
 * 어느 아이템에 대한 조작인지 시트 상단에 반드시 다시 보여준다 — 대상 요약(썸네일·제목·`카테고리 · N분`)
 * 구성은 탐색 더보기 시트와 통일한다(FE 확정 2026-08-07, 카테고리·길이 PM 2026-09-27).
 */
export default function MoreActionsSheet({
  item,
  onDetail,
  onSourceLink,
  onDelete,
  onShare,
  onDismiss,
  onDismissed,
}: MoreActionsSheetProps) {
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
        LIBRARY_COPY.card.durationLabel(Math.max(1, Math.round(shown.content.durationSec / 60))),
      ]
        .filter((part) => part.length > 0)
        .join(' · ')
    : '';

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
              accessibilityLabel={LIBRARY_COPY.moreSheet.detail}
            >
              <Text style={styles.actionLabel}>{LIBRARY_COPY.moreSheet.detail}</Text>
            </Pressable>
            {shown.content.sourceUrl !== null ? (
              <Pressable
                style={styles.action}
                onPress={() => onSourceLink(shown)}
                accessibilityRole="button"
                accessibilityLabel={LIBRARY_COPY.moreSheet.sourceLink}
              >
                <Text style={styles.actionLabel}>{LIBRARY_COPY.moreSheet.sourceLink}</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.action}
              onPress={() => onDelete(shown)}
              accessibilityRole="button"
              accessibilityLabel={LIBRARY_COPY.moreSheet.delete}
            >
              <Text style={[styles.actionLabel, styles.deleteLabel]}>
                {LIBRARY_COPY.moreSheet.delete}
              </Text>
            </Pressable>
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
              accessibilityLabel={LIBRARY_COPY.moreSheet.close}
            >
              <Text style={[styles.actionLabel, styles.closeLabel]}>
                {LIBRARY_COPY.moreSheet.close}
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
  deleteLabel: {
    color: theme.color.danger,
    fontWeight: '600',
  },
  closeLabel: {
    color: theme.color.textSecondary,
  },
});
