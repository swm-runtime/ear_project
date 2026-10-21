import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import FullScreenError from '@/shared/ui/FullScreenError';
import GlassCapsule, { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import GlassIconButton from '@/shared/ui/GlassIconButton';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { SkeletonBlock, SkeletonGroup } from '@/shared/ui/Skeleton';
import { Text } from '@/shared/ui/Typography';

import { CAREER_COPY } from '../career.copy';
import type { YearsOfExperienceRange } from '../career.types';
import CareerDialog from '../components/CareerDialog';
import JobCategoryChips from '../components/JobCategoryChips';
import JobTitleField from '../components/JobTitleField';
import YearsSegment from '../components/YearsSegment';
import { useCareerInfoScreen } from '../hooks/useCareerInfoScreen';

const YEARS_OPTIONS: YearsOfExperienceRange[] = ['0-1', '2-3', '4-6', '7+'];

/**
 * CR1~CR5 커리어 정보 — 화면은 뷰만 담당하고 로직은 useCareerInfoScreen이 소유한다.
 * 진입 경로는 둘(프로필 카드·설정 콘텐츠)이지만 화면은 하나다(career-uiux.md 3장).
 * 앱바·타이틀은 서버 응답과 무관하므로 로딩 중에도 먼저 그린다(uiux 4.1).
 * 직군 칩·직무 입력칸·연차 세그먼트는 온보딩 2/2(O4)와 **같은 부품**이다(components/, PM 2026-10-11).
 */
export default function CareerInfoScreen() {
  const screen = useCareerInfoScreen();

  return (
    <SafeAreaView style={styles.container}>
      {/* 앱바 — 뒤로가기 + "커리어 정보" + 우측 [초기화]. [저장](하단 독)과 오탭 거리를 두는
          배치가 확인 팝업 없는 즉시 실행의 전제다(career-uiux.md 4.2) */}
      <View style={styles.appBar}>
        {/* 뒤로 — 유리 원 안의 셰브론(상세 화면과 같은 문법, PM 2026-09-28 03:07) */}
        <GlassIconButton onPress={screen.handleBackPress} accessibilityLabel={CAREER_COPY.backA11y}>
          <ChevronIcon direction="left" size={BACK_ICON_SIZE} color={theme.color.textPrimary} />
        </GlassIconButton>
        {/* 터치를 통과시키는 View 로 감싼다 — Android 의 Text 는 pointerEvents 를 따르지 않아, 줄 전체에 겹친 제목이 뒤로 원의
            탭을 가로챌 수 있다(AndroidCollapsingBar 제목과 같은 이유, 2026-09-30) */}
        <View style={styles.appBarTitleBox} pointerEvents="none">
          <Text style={styles.appBarTitle} accessibilityRole="header" numberOfLines={1}>
            {CAREER_COPY.appBarTitle}
          </Text>
        </View>
        <View style={styles.appBarFill} />
        {/* [초기화] — 뒤로와 같은 유리 재질의 알약(글자 버튼이라 원이 아니라 캡슐이다) */}
        <GlassCapsule style={styles.resetCapsule}>
          <Pressable
            style={styles.resetButton}
            disabled={!screen.canReset}
            onPress={screen.resetForm}
            accessibilityRole="button"
            accessibilityLabel={CAREER_COPY.resetA11yLabel}
            accessibilityHint={CAREER_COPY.resetA11yHint}
            accessibilityState={{ disabled: !screen.canReset }}
            hitSlop={RESET_HIT_SLOP}
          >
            <Text style={[styles.resetLabel, !screen.canReset && styles.resetLabelDisabled]}>
              {CAREER_COPY.reset}
            </Text>
          </Pressable>
        </GlassCapsule>
      </View>

      {screen.isError ? (
        // 진입 조회 실패는 차단형이다 — 낡은 값을 폼에 채우면 그 위의 저장이 최신 값을 덮는다(career-api.md 4.1)
        <FullScreenError
          title={CAREER_COPY.loadFailed}
          retryLabel={CAREER_COPY.retry}
          isRetrying={screen.isRefetching}
          onRetry={screen.refetchAll}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.form}>
            {/* 큰 제목 — 관심 주제 관리와 같은 머리말(PM 2026-10-10). 서버 응답과 무관해 로딩 중에도 그린다(uiux 4.1) */}
            <Text style={styles.headline} accessibilityRole="header">
              {CAREER_COPY.headline}
            </Text>
            {screen.isLoading ? (
              screen.showSkeleton ? (
                // form 의 세로 간격을 그대로 이어받는다 — 낭독·반짝임은 영역 하나로
                <SkeletonGroup style={styles.skeletonArea}>
                  <SkeletonBlock style={styles.skeletonNotice} />
                  <SkeletonBlock style={styles.skeletonField} />
                  <SkeletonBlock style={styles.skeletonField} />
                  <SkeletonBlock style={styles.skeletonField} />
                </SkeletonGroup>
              ) : null
            ) : (
              <>
                {/* 미입력이면 유도 문구, 입력됨이면 용도 안내 — 분기 기준은 서버 값이다(uiux 4.1·4.3) */}
                <Text style={styles.notice}>
                  {screen.isServerEmpty ? CAREER_COPY.emptyNotice : CAREER_COPY.purposeNotice}
                </Text>

                <Text style={styles.fieldLabel}>{CAREER_COPY.jobCategoryLabel}</Text>
                {/* 칩 선택형(변경 2026-08-12 — 바텀시트에서 통일). 선택지는 서버 목록을 받은 순서대로 그린다.
                    재탭 해제가 값을 비우는 경로다 */}
                <JobCategoryChips
                  categories={screen.jobCategories.map((category) => category.name)}
                  value={screen.jobCategory}
                  onToggle={screen.toggleJobCategory}
                  disabled={screen.isSaving}
                />

                <Text style={styles.fieldLabel}>{CAREER_COPY.jobTitleLabel}</Text>
                <JobTitleField
                  value={screen.jobTitle}
                  onChangeText={screen.changeJobTitle}
                  placeholder={CAREER_COPY.jobTitlePlaceholder}
                  accessibilityLabel={CAREER_COPY.jobTitleLabel}
                  clearAccessibilityLabel={CAREER_COPY.jobTitleClearA11y}
                  disabled={screen.isSaving}
                />

                <Text style={styles.fieldLabel}>{CAREER_COPY.yearsLabel}</Text>
                {/* 연차 — 칸이 고정된 4택이라 **한 줄 구간 선택**(세그먼트, PM 2026-10-10). 줄바꿈 칩보다 같은 질문의 답으로
                    읽힌다. 선택한 칸을 다시 누르면 해제(빈 값 저장 경로 — uiux 4.4)는 그대로다 */}
                <YearsSegment
                  options={YEARS_OPTIONS}
                  labels={CAREER_COPY.yearsChip}
                  value={screen.yearsOfExperience}
                  onToggle={screen.toggleYears}
                  disabled={screen.isSaving}
                />
              </>
            )}
          </ScrollView>

          {/* 하단 고정 독 — [저장]은 변경 사항이 있을 때만 활성이다(career.md 4.1) */}
          <View style={styles.dock}>
            {screen.saveError !== null ? (
              // 사용자가 시작한 저장의 직접 결과라 assertive다(uiux 7장)
              <Text style={styles.dockError} accessibilityLiveRegion="assertive">
                {screen.saveError.message}
              </Text>
            ) : null}
            {screen.saveError?.isRetryable === true ? (
              /* CR4 — 같은 편집 값으로 다시 보낸다. 편집 상태는 유지된다(uiux 4.5) */
              <Pressable
                style={[pillButton.base, pillButton.primary, styles.save]}
                disabled={screen.isSaving}
                onPress={screen.retrySave}
                accessibilityRole="button"
                accessibilityLabel={CAREER_COPY.retry}
                accessibilityState={{ disabled: screen.isSaving }}
              >
                {screen.isSaving ? (
                  <ActivityIndicator color={theme.color.onPrimary} />
                ) : (
                  <Text style={styles.saveLabel}>{CAREER_COPY.retry}</Text>
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
                accessibilityLabel={CAREER_COPY.save}
                accessibilityState={{ disabled: !screen.canSave }}
              >
                {screen.isSaving ? (
                  <ActivityIndicator color={theme.color.onPrimary} />
                ) : (
                  <Text style={styles.saveLabel}>{CAREER_COPY.save}</Text>
                )}
              </Pressable>
            )}
          </View>
        </>
      )}

      {/* CR5 — 이탈 확인. 변경 있음 상태의 뒤로가기에만 뜬다(uiux 4.6) */}
      <CareerDialog
        isVisible={screen.isLeaveConfirmVisible}
        title={CAREER_COPY.leaveConfirm.title}
        secondaryAction={{ label: CAREER_COPY.leaveConfirm.stay, onPress: screen.stayEditing }}
        primaryAction={{
          label: CAREER_COPY.leaveConfirm.leave,
          onPress: screen.leaveWithoutSaving,
        }}
        onCloseRequest={screen.stayEditing}
      />
    </SafeAreaView>
  );
}

/** 앱바 뒤로 셰브론 — 글자 `‹` 는 폰트마다 굵기·세로 위치가 달라 도형으로 그린다(design.md §5). 유리 원(40) 안쪽 값 */
const BACK_ICON_SIZE = 20;

/** 보이는 40 을 터치 44 로 채운다(design.md §6) */
const RESET_HIT_SLOP = 2;

/** 가운데 제목의 좌우 비움 — 앱바 좌우 여백(16) + [초기화] 캡슐(글자 + 좌우 16)이 들어갈 자리 */
const APP_BAR_TITLE_INSET = 104;

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
  // 제목은 **화면 정가운데** — 오른쪽 [초기화] 캡슐이 왼쪽 뒤로 원(40)보다 넓어 flex 로 두면 가운데에서 왼쪽으로 밀렸다.
  // 좌우 버튼 사이를 채우는 대신 줄 전체에 겹쳐 놓고, 버튼 탭은 그대로 받게 터치를 통과시킨다
  // 좌우는 버튼 자리만큼 비운다 — 긴 제목(영어·큰 글자)이 [초기화]·뒤로 밑으로 겹치지 않고 말줄임된다(KAN-197).
  // 양쪽을 같은 값으로 비워 가운데는 그대로다
  appBarTitleBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: APP_BAR_TITLE_INSET,
  },
  appBarTitle: {
    textAlign: 'center',
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  // 유리 알약은 머리 줄 컨트롤 높이(40)를 쓰고, 44 터치는 안쪽 Pressable 의 hitSlop 이 채운다
  resetCapsule: {
    height: HEADER_CONTROL_HEIGHT,
  },
  appBarFill: { flex: 1 },
  resetButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  resetLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  resetLabelDisabled: {
    opacity: 0.4,
  },
  form: {
    paddingHorizontal: theme.spacing.lg,
    // 위는 큰 제목이 앱바 밑 8 에서 시작하게(관심 주제 관리 머리말과 같은 자리)
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  // 큰 제목 — 관심 주제 관리 headline 과 같은 값(28·700)
  headline: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.xl * 1.25,
  },
  notice: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  fieldLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginTop: theme.spacing.md,
  },
  skeletonArea: {
    gap: theme.spacing.sm,
  },
  skeletonNotice: {
    width: 180,
    height: theme.font.size.sm * 1.4,
    borderRadius: theme.radius.sm,
  },
  skeletonField: {
    height: theme.touchTarget.minHeight,
    borderRadius: theme.radius.md,
    marginTop: theme.spacing.md,
  },
  dock: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  dockError: {
    fontSize: theme.font.size.sm,
    color: theme.color.danger,
    textAlign: 'center',
  },
  // 크기만 — 모양·색은 공용 알약(pillButton)
  save: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
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
