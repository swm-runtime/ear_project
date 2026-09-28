import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import BottomSheet from '@/shared/ui/BottomSheet';

import { topicImageSource } from '@/features/interest';

import { LIBRARY_COPY } from '../library.copy';
import type { LibraryFilter, LibrarySourceFilter, LibraryTopic } from '../library.types';

const SOURCE_OPTIONS: LibrarySourceFilter[] = ['drip', 'save'];
/** 상태 — 종전 세그먼트 탭(전체·미청취·완료)이 시트의 라디오로 들어왔다(2026-09-25 PM) */
const STATUS_OPTIONS: LibraryFilter[] = ['all', 'unplayed', 'completed'];

interface TopicFilterSheetProps {
  visible: boolean;
  topics: LibraryTopic[];
  isLoading: boolean;
  appliedTopicIds: string[];
  appliedSourceFilter: LibrarySourceFilter | null;
  appliedStatus: LibraryFilter;
  /** [적용]으로만 반영된다. 딤·뒤로가기는 변경 폐기(library-uiux.md 4.5) */
  onApply: (
    selected: LibraryTopic[],
    sourceFilter: LibrarySourceFilter | null,
    status: LibraryFilter,
  ) => void;
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
  appliedStatus,
  onApply,
  onDismiss,
}: TopicFilterSheetProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(appliedTopicIds);
  const [sourceDraft, setSourceDraft] = useState<LibrarySourceFilter | null>(appliedSourceFilter);
  // 상태는 단일 선택(라디오) — '전체'가 해제 상태다
  const [statusDraft, setStatusDraft] = useState<LibraryFilter>(appliedStatus);

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
    <BottomSheet isVisible={visible} onRequestClose={onDismiss} sheetStyle={styles.sheet}>
      <View>
        <View style={styles.handle} />
        <Text style={styles.title}>{LIBRARY_COPY.topicFilter.sheetTitle}</Text>

        <Text style={styles.sectionTitle}>{LIBRARY_COPY.topicFilter.statusTitle}</Text>
        <View style={styles.chipWrap} accessibilityRole="radiogroup">
          {STATUS_OPTIONS.map((status) => {
            const isSelected = statusDraft === status;
            return (
              <Pressable
                key={status}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => setStatusDraft(status)}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={LIBRARY_COPY.tab[status]}
              >
                <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
                  {LIBRARY_COPY.tab[status]}
                </Text>
              </Pressable>
            );
          })}
        </View>

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
                  style={styles.topicChip}
                  onPress={() => toggle(topic.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={topic.name}
                >
                  {/* 주제 칩은 사진 알약이다(design.md 주제 칩 — 온보딩·탐색과 같은 문법, PM 2026-09-27 19:31).
                      선택은 짙어진 막 — 상태·출처 칩은 주제가 아니라 사진이 없으므로 종전 테두리 알약 그대로다 */}
                  <Image
                    source={topicImageSource(topic.name)}
                    resizeMode="cover"
                    style={styles.topicPhoto}
                  />
                  <View style={[styles.topicOverlay, isSelected && styles.topicOverlaySelected]} />
                  <Text style={styles.topicChipLabel} numberOfLines={1}>
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
              setStatusDraft('all');
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
                statusDraft,
              )
            }
            accessibilityRole="button"
            accessibilityLabel={LIBRARY_COPY.topicFilter.apply}
          >
            <Text style={styles.applyLabel}>{LIBRARY_COPY.topicFilter.apply}</Text>
          </Pressable>
        </View>
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
    /*
     * 위쪽은 `sm` — 손잡이가 시트 가장자리에 붙는다(iOS 그래버 자리). 종전 `padding: lg` 는 4pt 손잡이 위에 24를
     * 비워 상단이 텅 비어 보였다(PM 2026-09-27 23:32). 플레이어 시트 3종이 이미 `paddingTop: sm` 이라 그쪽에 맞춘다.
     * 좌우는 `lg` 를 유지한다 — 칩이 줄바꿈으로 차는 시트라 여백이 좁으면 칩이 가장자리에 붙는다
     */
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
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
    borderRadius: theme.radius.xl,
    borderCurve: 'continuous',
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
  /*
   * 주제 칩 — 사진 알약(design.md 주제 칩). 위 `chip`(상태·출처)과 구조가 다르다: 클리핑은 알약이 한 번만 하고,
   * **칩에 패딩을 주지 않는다**(사진의 `100%` 가 콘텐츠 박스로 풀려 가장자리에 배경이 드러난다) — 좌우 여백은 라벨이 갖는다
   */
  topicChip: {
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  /** 사진 — inset 과 퍼센트 크기를 함께 준다(웹은 inset 만으로 원본 800×320 이 남는다) */
  topicPhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  topicOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
  },
  /** 선택 — 막만 짙어진다(온보딩·탐색 칩과 같은 토큰) */
  topicOverlaySelected: {
    backgroundColor: theme.color.photoScrim,
  },
  topicChipLabel: {
    // 칩이 아니라 라벨이 좌우 여백을 갖는다 — 위 topicChip 주석 참고
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.font.size.sm,
    // 선택 여부와 무관하게 굵기를 고정한다 — 굵히면 칩 폭이 변해 뒤 칩들이 밀린다
    fontWeight: '700',
    color: theme.color.onPrimary,
    textShadowColor: theme.color.photoTextShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
    borderCurve: 'continuous',
    // 보조 동작은 테두리 없이 연한 면(design.md §5 — ConfirmDialog·재생 확인 팝업과 같은 규칙, 2026-09-27 PM
    // "초기화·적용 버튼이 다른 모달들과 살짝 다르다"). 선으로 그린 상자는 검정 버튼 옆에서 낡아 보인다
    backgroundColor: theme.color.surface,
  },
  resetLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  applyButton: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: theme.color.primary,
  },
  applyLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
