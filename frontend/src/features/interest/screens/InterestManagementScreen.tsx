import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import FullScreenError from '@/shared/ui/FullScreenError';

import InterestDialog from '../components/InterestDialog';
import TopicChip from '../components/TopicChip';
import { useInterestManagementScreen } from '../hooks/useInterestManagementScreen';
import { INTEREST_COPY } from '../interest.copy';

/** IM9 — 칩 모양 스켈레톤. 스피너를 중앙에 띄우지 않는다(interest-management-uiux.md 4.7) */
const SKELETON_CHIP_WIDTHS = [88, 104, 72, 96, 120, 80, 108, 92];

/**
 * IM1~IM9 관심 주제 관리 — 화면은 뷰만 담당하고 로직은 useInterestManagementScreen이 소유한다.
 * 진입 경로는 셋(프로필 카드·설정 콘텐츠·드립 배너)이지만 화면은 하나다(uiux 3장).
 * 앱바 타이틀·헤드라인은 서버 응답과 무관하므로 로딩 중에도 먼저 그린다(uiux 4.7).
 */
export default function InterestManagementScreen() {
  const screen = useInterestManagementScreen();

  const showBadge = screen.hasChanges;
  // 개수 표기와 변경 배지는 하나의 라이브 리전으로 묶어 한 문장으로 읽힌다(uiux 7장)
  const countA11yLabel = [
    INTEREST_COPY.countA11y(screen.selectedCount, screen.maxSelectable),
    ...(showBadge ? [INTEREST_COPY.changeBadge(screen.changeCount)] : []),
  ].join(', ');

  return (
    <SafeAreaView style={styles.container}>
      {/* 앱바 — 뒤로가기 + "관심 주제 관리"(uiux 4.1). 탭바는 그리지 않는다(푸시된 하위 화면) */}
      <View style={styles.appBar}>
        <Pressable
          style={styles.backButton}
          onPress={screen.handleBackPress}
          accessibilityRole="button"
          accessibilityLabel={INTEREST_COPY.backA11y}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appBarTitle} accessibilityRole="header">
          {INTEREST_COPY.appBarTitle}
        </Text>
        <View style={styles.appBarSpacer} />
      </View>

      {screen.isError ? (
        <FullScreenError
          title={INTEREST_COPY.loadFailed}
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
              screen.showSkeleton ? <View style={styles.skeletonCount} /> : null
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
                {showBadge ? (
                  <View style={styles.changeBadge}>
                    <Text style={styles.changeBadgeLabel}>
                      {INTEREST_COPY.changeBadge(screen.changeCount)}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
            {/* IM6 — 초과 보유자 안내. "5/3 선택"을 거짓 클램프하지 않는다(uiux 4.5) */}
            {screen.overLimitCount > 0 ? (
              <View style={styles.overLimitBanner} accessibilityLiveRegion="polite">
                <Text style={styles.overLimitText}>
                  {INTEREST_COPY.overLimitBanner(screen.overLimitCount)}
                </Text>
              </View>
            ) : null}
          </View>

          <ScrollView contentContainerStyle={styles.chipArea}>
            {screen.isLoading ? (
              screen.showSkeleton ? (
                SKELETON_CHIP_WIDTHS.map((width, index) => (
                  <View key={index} style={[styles.skeletonChip, { width }]} />
                ))
              ) : null
            ) : (
              // 선택 개수로 칩을 비활성 처리하지 않는다(변경 2026-08-11) — 상한은 저장 게이트가 안내한다
              screen.topics.map((topic) => (
                <TopicChip
                  key={topic.topicId}
                  label={topic.name}
                  isSelected={topic.isSelected}
                  isDimmed={false}
                  onPress={() => screen.toggleTopic(topic.topicId)}
                />
              ))
            )}
          </ScrollView>

          {/* 하단 고정 독 — 칩이 늘어 스크롤이 생겨도 [저장]이 묻히지 않는다(uiux 4.1) */}
          <View style={styles.dock}>
            {screen.isBelowMin && !screen.isLoading ? (
              <Text style={styles.dockNotice}>{INTEREST_COPY.minRequired}</Text>
            ) : null}
            {/* 상한 초과 — 0개 사유와 같은 패턴으로 저장이 왜 잠겼는지 상시 노출한다(변경 2026-08-11) */}
            {screen.isOverLimit && !screen.isLoading ? (
              <Text style={styles.dockNotice}>{INTEREST_COPY.limitNotice}</Text>
            ) : null}
            {screen.saveErrorMessage !== null ? (
              <Text style={styles.dockError} accessibilityLiveRegion="polite">
                {screen.saveErrorMessage}
              </Text>
            ) : null}
            {screen.saveErrorMessage !== null ? (
              /* IM8 — 같은 저장의 반복이라 확인 팝업 없이 다시 보낸다(uiux 4.7) */
              <Pressable
                style={styles.save}
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
                style={[styles.save, !screen.canSave && styles.saveDisabled]}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  backButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.xl + 2,
  },
  appBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  appBarSpacer: {
    minWidth: theme.touchTarget.minWidth,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  headline: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.lg * 1.4,
    marginTop: theme.spacing.md,
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
  changeBadge: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs / 2,
  },
  changeBadgeLabel: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.primary,
  },
  overLimitBanner: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
    padding: theme.spacing.md,
  },
  overLimitText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.sm * 1.5,
  },
  chipArea: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  skeletonCount: {
    width: 96,
    height: theme.font.size.sm * 1.4,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
  skeletonChip: {
    height: theme.touchTarget.minHeight,
    borderRadius: theme.radius.lg + theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
  dock: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
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
  save: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
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
