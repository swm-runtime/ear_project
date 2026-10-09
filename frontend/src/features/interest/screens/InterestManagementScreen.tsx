import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import FullScreenError from '@/shared/ui/FullScreenError';
import { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import GlassIconButton from '@/shared/ui/GlassIconButton';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { SkeletonBlock, SkeletonGroup } from '@/shared/ui/Skeleton';
import { Text } from '@/shared/ui/Typography';

import { InterestBubbleField, InterestBubbleSkeleton } from '../components/InterestBubbleField';
import InterestDialog from '../components/InterestDialog';
import { topicImageSource } from '../components/TopicChip';
import { useInterestManagementScreen } from '../hooks/useInterestManagementScreen';
import { INTEREST_COPY } from '../interest.copy';

/**
 * IM1~IM9 관심 주제 관리 — 화면은 뷰만 담당하고 로직은 useInterestManagementScreen이 소유한다.
 * 진입 경로는 셋(프로필 카드·설정 콘텐츠·드립 배너)이지만 화면은 하나다(uiux 3장).
 * 앱바 타이틀·헤드라인은 서버 응답과 무관하므로 로딩 중에도 먼저 그린다(uiux 4.7).
 */
export default function InterestManagementScreen() {
  const screen = useInterestManagementScreen();

  // 하단 독의 요약 — 고른 주제의 사진을 겹쳐 쌓고 이름을 잇는다(PM 2026-10-09 D안)
  const selectedTopics = screen.topics.filter((topic) => topic.isSelected);
  const isFull = screen.selectedCount >= screen.maxSelectable;
  // 진행 막대·"변경 사항 N개" 배지는 뺐다(PM 2026-10-10 00:57) — 개수는 "N/3 선택" 한 줄이 맡는다
  const countA11yLabel = INTEREST_COPY.countA11y(screen.selectedCount, screen.maxSelectable);

  return (
    <SafeAreaView style={styles.container}>
      {/* 앱바 — 뒤로가기 + "관심 주제 관리"(uiux 4.1). 탭바는 그리지 않는다(푸시된 하위 화면) */}
      <View style={styles.appBar}>
        {/* 뒤로 — 유리 원 안의 셰브론(상세 화면과 같은 문법, PM 2026-09-28 03:07) */}
        <GlassIconButton
          onPress={screen.handleBackPress}
          accessibilityLabel={INTEREST_COPY.backA11y}
        >
          <ChevronIcon direction="left" size={BACK_ICON_SIZE} color={theme.color.textPrimary} />
        </GlassIconButton>
        <Text style={styles.appBarTitle} accessibilityRole="header">
          {INTEREST_COPY.appBarTitle}
        </Text>
        <View style={styles.appBarSpacer} />
      </View>

      {/*
        IM9 — 조회 실패와 "응답은 정상인데 노출 주제가 0건"을 같은 층으로 그린다.
        온보딩 1단계와 같은 규칙이고(같은 엔드포인트) 0건은 200이라 카피만 갈라진다.
      */}
      {screen.isError ? (
        <FullScreenError
          title={screen.isEmpty ? INTEREST_COPY.emptyTitle : INTEREST_COPY.loadFailed}
          description={screen.isEmpty ? INTEREST_COPY.emptyDescription : undefined}
          retryLabel={INTEREST_COPY.retry}
          isRetrying={screen.isRefetching}
          onRetry={screen.refetchAll}
        />
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.headline}>{INTEREST_COPY.headline}</Text>
            {screen.isLoading ? (
              // 개수 표기 자리도 스켈레톤에 포함한다(uiux 4.7)
              screen.showSkeleton ? (
                <SkeletonGroup>
                  <SkeletonBlock style={styles.skeletonCount} />
                </SkeletonGroup>
              ) : null
            ) : (
              <View
                style={styles.countRow}
                accessible
                accessibilityLiveRegion="polite"
                accessibilityLabel={countA11yLabel}
              >
                <Text style={styles.countLabel}>
                  {INTEREST_COPY.countLabel(screen.selectedCount, screen.maxSelectable)}
                </Text>
              </View>
            )}
            {/* IM6 — 초과 보유자 안내. "5/3 선택"을 거짓 클램프하지 않는다(uiux 4.5) */}
            {screen.overLimitCount > 0 ? (
              <View style={styles.overLimitBanner} accessibilityLiveRegion="polite">
                <Text style={styles.overLimitText}>
                  {INTEREST_COPY.overLimitBanner(screen.overLimitCount, screen.maxSelectable)}
                </Text>
              </View>
            ) : null}
          </View>

          {/*
            버블 밭(PM 2026-10-09 D안 — 종전 사진 알약 2열은 선택 여부가 보이지 않았다). 상한까지 고르면 남은 버블이
            흐려지고, 누르면 고르지 않고 상한 토스트가 뜬다(PM 2026-10-10 01:08 — 종전 "탭 허용·저장만 막음"(08-11)을 바꿨다)
          */}
          <ScrollView style={styles.field} showsVerticalScrollIndicator={false}>
            {screen.isLoading ? (
              screen.showSkeleton ? (
                <InterestBubbleSkeleton />
              ) : null
            ) : (
              <InterestBubbleField
                topics={screen.topics}
                isFull={isFull}
                onToggle={screen.toggleTopic}
              />
            )}
          </ScrollView>

          {/* 하단 고정 독 — 칩이 늘어 스크롤이 생겨도 [저장]이 묻히지 않는다(uiux 4.1) */}
          <View style={styles.dock}>
            {/* 상한 초과 — 0개 사유와 같은 패턴으로 저장이 왜 잠겼는지 상시 노출한다(변경 2026-08-11) */}
            {screen.isOverLimit && !screen.isLoading ? (
              <Text style={styles.dockNotice}>
                {INTEREST_COPY.limitNotice(screen.maxSelectable)}
              </Text>
            ) : null}
            {screen.saveErrorMessage !== null ? (
              <Text style={styles.dockError} accessibilityLiveRegion="polite">
                {screen.saveErrorMessage}
              </Text>
            ) : null}
            {/* 요약 바 — 고른 주제 사진 겹침 · 이름 · [저장] 한 줄(D안). 저장 규칙·문구는 종전 그대로 */}
            <View style={styles.summaryBar}>
              <View style={styles.avatars}>
                {selectedTopics.length === 0 ? (
                  // 0개 — 점선 원 없이 자리만 비워 둔다(PM 2026-10-10 00:56). 자리는 남겨 옆 문구가 좌우로 뛰지 않게
                  <View style={styles.avatarEmpty} />
                ) : (
                  selectedTopics
                    .slice(0, AVATAR_MAX)
                    .map((topic, index) => (
                      <Image
                        key={topic.topicId}
                        source={topicImageSource(topic.name)}
                        style={[styles.avatar, index > 0 && styles.avatarOverlap]}
                      />
                    ))
                )}
              </View>
              {/* 0개 사유는 [저장] 바로 왼쪽에 — 왜 잠겼는지가 버튼 옆에서 읽힌다(PM 2026-10-09 23:27, 종전 바 위 한 줄) */}
              {screen.isBelowMin && !screen.isLoading ? (
                <Text
                  style={[styles.summaryLabel, styles.summaryNotice]}
                  numberOfLines={2}
                  accessibilityLiveRegion="polite"
                >
                  {INTEREST_COPY.minRequired}
                </Text>
              ) : (
                <Text style={styles.summaryLabel} numberOfLines={1}>
                  {selectedTopics.map((topic) => topic.name).join(' · ')}
                </Text>
              )}
              {screen.saveErrorMessage !== null ? (
                /* IM8 — 같은 저장의 반복이라 확인 팝업 없이 다시 보낸다(uiux 4.7) */
                <Pressable
                  style={[pillButton.base, pillButton.primary, styles.save]}
                  disabled={screen.isSaving}
                  onPress={screen.retrySave}
                  accessibilityRole="button"
                  accessibilityLabel={INTEREST_COPY.retry}
                  accessibilityState={{ disabled: screen.isSaving }}
                >
                  {screen.isSaving ? (
                    <ActivityIndicator color={theme.color.onPrimary} />
                  ) : (
                    <Text style={styles.saveLabel}>{INTEREST_COPY.retry}</Text>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  style={[
                    pillButton.base,
                    pillButton.primary,
                    styles.save,
                    !screen.canSave && styles.saveDisabled,
                  ]}
                  disabled={!screen.canSave}
                  onPress={screen.handleSavePress}
                  accessibilityRole="button"
                  accessibilityLabel={INTEREST_COPY.save}
                  accessibilityState={{ disabled: !screen.canSave }}
                >
                  {screen.isSaving ? (
                    <ActivityIndicator color={theme.color.onPrimary} />
                  ) : (
                    <Text style={styles.saveLabel}>{INTEREST_COPY.save}</Text>
                  )}
                </Pressable>
              )}
            </View>
          </View>
        </>
      )}

      {/* IM4 — 해제 포함 저장의 확인. 본문만 두는 한 문단 팝업, 저장당 1회(uiux 4.4) */}
      <InterestDialog
        isVisible={screen.isConfirmVisible}
        message={INTEREST_COPY.removalConfirm.message}
        secondaryAction={{
          label: INTEREST_COPY.removalConfirm.cancel,
          onPress: screen.cancelRemovalConfirm,
        }}
        primaryAction={{
          label: INTEREST_COPY.removalConfirm.confirm,
          onPress: screen.confirmRemovalAndSave,
        }}
        onCloseRequest={screen.cancelRemovalConfirm}
      />

      {/* IM7 — 이탈 확인. [저장] 버튼을 두지 않는다(팝업이 겹쳐 쌓인다 — uiux 3장) */}
      <InterestDialog
        isVisible={screen.isLeaveConfirmVisible}
        title={INTEREST_COPY.leaveConfirm.title}
        secondaryAction={{ label: INTEREST_COPY.leaveConfirm.stay, onPress: screen.stayEditing }}
        primaryAction={{
          label: INTEREST_COPY.leaveConfirm.leave,
          onPress: screen.leaveWithoutSaving,
        }}
        onCloseRequest={screen.stayEditing}
      />
    </SafeAreaView>
  );
}

/** 요약 바에 겹쳐 그리는 사진 수 — 초과 보유자(IM6)여도 바가 넘치지 않게 */
const AVATAR_MAX = 3;
const AVATAR_SIZE = 34;

/** 앱바 뒤로 셰브론 — 글자 `‹` 는 폰트마다 굵기·세로 위치가 달라 도형으로 그린다(design.md §5). 유리 원(40) 안쪽 값 */
const BACK_ICON_SIZE = 20;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    // 좌우 16 — 설정·라이브러리·탐색 상단 버튼과 같은 선(PM 2026-09-30 05:28 "상단 버튼 양쪽 공백이 안 맞는다", 종전 8)
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  appBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  appBarSpacer: {
    minWidth: HEADER_CONTROL_HEIGHT,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  // 큰 제목 — 화면의 주인공이 버블이라 머리말은 크고 짧게(D안)
  headline: {
    fontSize: theme.font.size.xl,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.xl * 1.25,
    marginTop: theme.spacing.sm,
  },
  field: {
    flex: 1,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  countLabel: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  overLimitBanner: {
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
    padding: theme.spacing.md,
  },
  overLimitText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.sm * 1.5,
  },
  skeletonCount: {
    width: 96,
    height: theme.font.size.sm * 1.4,
    borderRadius: theme.radius.sm,
  },
  dock: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md - 4,
    minHeight: 64,
    paddingLeft: theme.spacing.md - 4,
    paddingRight: theme.spacing.sm,
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
  },
  avatars: {
    flexDirection: 'row',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    // 겹친 사진 사이를 바 색 테두리로 가른다
    borderWidth: 2.5,
    borderColor: theme.color.surface,
  },
  avatarOverlap: {
    marginLeft: -10,
  },
  avatarEmpty: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  summaryLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  summaryNotice: {
    fontWeight: '500',
    color: theme.color.textSecondary,
  },
  dockNotice: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  dockError: {
    fontSize: theme.font.size.sm,
    color: theme.color.danger,
    textAlign: 'center',
  },
  // 크기만 — 모양·색은 공용 알약(pillButton). 요약 바 안의 오른쪽 알약이라 폭은 글자만큼
  save: {
    minHeight: theme.touchTarget.minHeight + 4,
    paddingHorizontal: theme.spacing.lg,
  },
  saveDisabled: {
    backgroundColor: theme.color.border,
  },
  saveLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
