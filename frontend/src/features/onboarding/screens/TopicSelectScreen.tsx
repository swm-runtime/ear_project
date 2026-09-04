import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import FullScreenError from '@/shared/ui/FullScreenError';

import { topicImageSource } from '@/features/interest';

import TopicMarqueeRow from '../components/TopicMarqueeRow';
import { useTopicSelectScreen } from '../hooks/useTopicSelectScreen';
import { ONBOARDING_COPY } from '../onboarding.copy';

const ROW_COUNT = 4;
const PILL_WIDTH = 156;
/** 기본 흐름 속도(px/초)와 줄별 배율 — 같은 박자로 움직이면 기계적으로 보인다 */
const BASE_SPEED = 18;
const SPEED_SCALES = [1, 0.9, 1.05, 1.1] as const;
/** 줄마다 다른 시작 위상 — 벽돌 어긋남 + 열이 겹쳐 보이지 않게 전부 다르다 */
const PHASES = [40, 122, 96, 10] as const;

/**
 * 칩을 4줄에 라운드로빈으로 나눈다 — 세로 스크롤 없이 줄마다 가로로 흐른다.
 * 읽는 순서는 열 단위(위→아래)가 되지만 선택 동작·목록 순서 자체는 그대로다.
 */
function toRows<T>(items: T[]): T[][] {
  const rows: T[][] = Array.from({ length: ROW_COUNT }, () => []);
  items.forEach((item, index) => rows[index % ROW_COUNT].push(item));
  return rows.filter((row) => row.length > 0);
}

/**
 * O1–O3 관심 주제 선택(1/3). 이 화면에는 [건너뛰기]가 없다 —
 * 주제는 드립 편성의 유일한 필수 신호다(onboarding-uiux.md 4.1).
 * 시각 개편(2026-09-03): 큰 회색 헤드라인 + 사진 알약 마퀴 4줄(줄마다 반대 방향으로
 * 자동 흐름·무한 루프) + 상단 선택 요약 칩(✕로 해제) + 원형 [다음] 버튼.
 * 문서 반영 요청: changes/pending/onboarding-o1-visual-refresh.md
 */
export default function TopicSelectScreen() {
  const insets = useSafeAreaInsets();
  const {
    topics,
    selectedCount,
    canGoNext,
    isSubmitting,
    showSkeleton,
    isLoading,
    isError,
    isRefetching,
    refetch,
    toggleTopic,
    handleNextPress,
  } = useTopicSelectScreen();

  // 로딩 중에도 제목은 먼저 그린다 — 이 단계가 무엇인지는 이미 정해져 있다(onboarding-uiux.md 4.2)
  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(theme.spacing.md - insets.top, 0) }]}>
        {/*
          상단 툴바 — 가운데 타이틀만 둔다. 1단계는 되돌아갈 곳이 없고(4.1) [건너뛰기]도
          없으므로(주제는 드립 편성의 유일한 필수 신호) 좌우는 비운다.
        */}
        <View style={styles.toolbar}>
          <Text style={styles.toolbarTitle} accessibilityRole="header">
            {ONBOARDING_COPY.topic.toolbarTitle}
          </Text>
        </View>
        <Text style={styles.stepLabel} accessibilityLabel="3단계 중 1단계">
          1/3 단계
        </Text>
        <Text style={styles.title}>{ONBOARDING_COPY.topic.title}</Text>
        {/*
          선택 요약 자리 — 0개면 공백, 고르면 아래 알약과 같은 사진 칩이 가로로 쌓인다.
          ✕ 포함 칩 전체가 해제 버튼이다. 높이를 고정해 아래 캐러셀이 튀지 않게 한다.
        */}
        <View style={styles.progressSlot} accessibilityLiveRegion="polite">
          {selectedCount === 0 ? null : (
            <View style={styles.selectedRow}>
              {topics
                .filter((topic) => topic.isSelected)
                .map((topic) => (
                  <Pressable
                    key={topic.topicId}
                    style={styles.selectedChip}
                    onPress={() => toggleTopic(topic.topicId)}
                    accessibilityRole="button"
                    accessibilityLabel={topic.name + ' 선택 해제'}
                  >
                    <Image
                      source={topicImageSource(topic.topicId)}
                      resizeMode="cover"
                      style={styles.selectedChipPhoto}
                    />
                    <View style={styles.selectedChipOverlay} />
                    <Text style={styles.selectedChipLabel}>{topic.name}</Text>
                    <Text style={styles.selectedChipX} importantForAccessibility="no">
                      ✕
                    </Text>
                  </Pressable>
                ))}
            </View>
          )}
        </View>
      </View>

      {isError ? (
        <FullScreenError
          title={ONBOARDING_COPY.topic.loadFailedTitle}
          description={ONBOARDING_COPY.topic.loadFailedDescription}
          retryLabel={ONBOARDING_COPY.topic.retry}
          isRetrying={isRefetching}
          onRetry={refetch}
        />
      ) : (
        <>
          {/* 캐러셀을 헤더와 하단 버튼 사이 세로 중앙에 앉힌다 */}
          <View style={styles.centerSpacer} />
          <View style={styles.marqueeArea}>
            {isLoading ? (
              showSkeleton ? (
                Array.from({ length: ROW_COUNT }, (_, rowIndex) => (
                  <View key={rowIndex} style={styles.skeletonRow}>
                    <View style={styles.skeletonChip} />
                    <View style={styles.skeletonChip} />
                    <View style={styles.skeletonChip} />
                  </View>
                ))
              ) : null
            ) : (
              toRows(topics).map((row, rowIndex) => (
                <TopicMarqueeRow
                  key={row[0].topicId}
                  topics={row}
                  // 홀수 줄(1·3번째)은 왼쪽으로, 짝수 줄(2·4번째)은 오른쪽으로 흐른다
                  direction={rowIndex % 2 === 0 ? 1 : -1}
                  phase={PHASES[rowIndex % PHASES.length]}
                  speed={BASE_SPEED * SPEED_SCALES[rowIndex % SPEED_SCALES.length]}
                  pillWidth={PILL_WIDTH}
                  dimmedHint={ONBOARDING_COPY.topic.limitToast}
                  onToggle={toggleTopic}
                />
              ))
            )}
          </View>
          <View style={styles.centerSpacer} />
        </>
      )}

      {!isError ? (
        <View style={styles.dock}>
          {/*
            [다음]은 원형 버튼 — 라벨은 낭독으로만 남는다. 미충족 안내 문구는 그리지 않는다.
            비활성·인플라이트 규칙은 그대로다.
          */}
          <Pressable
            style={[styles.next, (!canGoNext || isLoading) && styles.nextDisabled]}
            disabled={!canGoNext || isLoading || isSubmitting}
            onPress={handleNextPress}
            accessibilityRole="button"
            accessibilityLabel={ONBOARDING_COPY.topic.next}
            accessibilityState={{ disabled: !canGoNext || isLoading || isSubmitting }}
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.color.onPrimary} />
            ) : (
              <ChevronIcon direction="right" size={28} color={theme.color.onPrimary} />
            )}
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
    paddingHorizontal: theme.spacing.lg,
  },
  header: {
    // paddingTop은 inset에 따라 화면에서 계산한다 — SafeAreaView가 이미 넣은 여백 위에
    // 고정값을 또 더하면 기기에서만 헤더가 두 배로 내려온다(웹은 inset이 0이다)
    gap: theme.spacing.sm,
  },
  toolbar: {
    height: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarTitle: {
    // lg(20)와 xl(28) 사이 — 툴바 한도 안에서 존재감 있게
    fontSize: 24,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  stepLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
    // 위(툴바)·아래(헤드라인) 여백을 동일하게 — header gap 8 + 16 = 각 24
    marginVertical: theme.spacing.md,
  },
  // 큰 회색 헤드라인 — 안내 문구까지 한 문장으로 담는다
  title: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.xl * 1.35,
  },
  /** 선택 요약 슬롯 — 비었을 때도 높이를 지켜 아래가 흔들리지 않게 */
  progressSlot: {
    minHeight: 40,
    justifyContent: 'center',
  },
  selectedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  /** 아래 마퀴 알약과 같은 사진·오버레이 문법의 축소판 + ✕ */
  selectedChip: {
    height: 36,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs + 2,
    paddingHorizontal: theme.spacing.md,
  },
  selectedChipPhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  selectedChipOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  selectedChipLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.onPrimary,
  },
  selectedChipX: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.onPrimary,
    opacity: 0.85,
  },
  /** 캐러셀 위아래 균등 여백 — 세로 중앙 배치 */
  centerSpacer: {
    flex: 1,
  },
  /** 컨테이너 패딩을 상쇄해 알약이 화면 가장자리 밑으로 흐르게 한다 */
  marqueeArea: {
    marginHorizontal: -theme.spacing.lg,
    // 세로 간격은 가로(알약 사이 8)보다 살짝 넓게
    gap: theme.spacing.sm + theme.spacing.xs,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  skeletonChip: {
    width: PILL_WIDTH,
    height: theme.touchTarget.minHeight + theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.surface,
  },
  dock: {
    gap: theme.spacing.sm,
    // 화면 하단과 [다음] 버튼 사이 여유 — 엄지 존에서 너무 붙지 않게
    paddingBottom: theme.spacing.xxl + theme.spacing.lg,
    alignItems: 'flex-end',
  },
  /** 원형 [다음] — 우하단 고정. 터치 타깃 44pt를 넉넉히 넘는 64pt */
  next: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextDisabled: {
    backgroundColor: theme.color.border,
  },
});
