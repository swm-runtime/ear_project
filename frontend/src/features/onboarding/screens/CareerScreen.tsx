import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { localized, type LocalizedCopy } from '@/shared/i18n/localized';
import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import { SkeletonBlock, SkeletonGroup } from '@/shared/ui/Skeleton';
import { Text } from '@/shared/ui/Typography';

import { JOB_CHIP_HEIGHT, JOB_CHIP_RADIUS, JobCategoryChips, JobTitleField, YearsSegment } from '@/features/career';

import { useCareerScreen } from '../hooks/useCareerScreen';
import { ONBOARDING_COPY } from '../onboarding.copy';
import type { YearsOfExperience } from '../onboarding.types';

const YEARS_OPTIONS: YearsOfExperience[] = ['0-1', '2-3', '4-6', '7+'];
/** 직군 칩 스켈레톤 — 실제 칩과 같은 2열 같은 크기 상자 두 줄(직군 7종이면 네 줄이지만, 자리만 잡으면 된다) */
const JOB_CATEGORY_SKELETON_COUNT = 4;

const ko = { backA11y: '이전 단계로', stepA11y: '2단계 중 2단계', step: '2/2 단계' } as const;
const en: LocalizedCopy<typeof ko> = {
  backA11y: 'Previous step',
  stepA11y: 'Step 2 of 2',
  step: 'Step 2/2',
};
const COPY = localized({ ko, en });

/**
 * O4 커리어 정보(2/2 — 담기 단계를 뺀 2026-10-11 뒤 마지막 입력 단계). 전부 선택 항목 — 미입력 필드에 에러 표시를 하지 않고
 * [다음]은 입력값과 무관하게 항상 활성이다(onboarding-uiux.md 4.3).
 * 상단은 O1과 같은 컨셉(2026-09-03): 가운데 타이틀 툴바(+뒤로가기 · 우상단 [건너뛰기]) · "2/2 단계" · 큰 회색 헤드라인.
 * **입력 폼은 설정의 커리어 정보 화면과 같은 부품**이다(PM 2026-10-11 "온보딩 2/2 는 설정의 커리어 정보에서 입력하는 거
 * 가져오자") — 직군 사진 칩 2열 · 직무 면 알약 입력칸 · 연차 세그먼트(`@/features/career`). 하단은 우하단 원형 [>] 그대로.
 * [건너뛰기]는 보조 스타일이되 숨기거나 작게 만들지 않는다(4.3).
 * 문서 반영 요청: changes/pending/onboarding-o1-visual-refresh.md · changes/pending/onboarding-career-form-reuse.md
 */
export default function CareerScreen() {
  const insets = useSafeAreaInsets();
  const {
    jobCategory,
    jobTitle,
    yearsOfExperience,
    jobCategoryOptions,
    isJobCategoriesLoading,
    showJobCategoriesSkeleton,
    isJobCategoriesError,
    retryJobCategories,
    setJobCategory,
    setJobTitle,
    setYearsOfExperience,
    isNextSubmitting,
    isSkipSubmitting,
    isSubmitting,
    handleNextPress,
    handleSkipPress,
    handleBackPress,
  } = useCareerScreen();

  // 직군 칩 — 서버 목록·서버 순서 그대로(career-api.md 4.3). [선택 안 함]은 값이 아니라
  // 선택 칩 재탭(해제)이 담당한다. 실패해도 진행은 막히지 않는다 — 칩 영역만 에러를 그린다
  const renderJobCategoryField = () => {
    if (isJobCategoriesLoading) {
      // 0.3초 전에는 칩 한 줄 높이만 비워 둔다 — 로드되는 순간 아래 필드가 밀리지 않게
      return showJobCategoriesSkeleton ? (
        <SkeletonGroup style={styles.chipRow}>
          {Array.from({ length: JOB_CATEGORY_SKELETON_COUNT }, (_, index) => (
            <SkeletonBlock key={index} style={styles.chipSkeleton} />
          ))}
        </SkeletonGroup>
      ) : (
        <View style={styles.chipRowLoading} />
      );
    }
    if (isJobCategoriesError) {
      return (
        <View style={styles.chipRowError}>
          <Text style={styles.chipRowErrorText}>
            {ONBOARDING_COPY.career.jobCategoryLoadFailed}
          </Text>
          <Pressable
            onPress={retryJobCategories}
            accessibilityRole="button"
            accessibilityLabel={ONBOARDING_COPY.career.retry}
            style={styles.chipRowRetry}
          >
            <Text style={styles.chipRowRetryLabel}>{ONBOARDING_COPY.career.retry}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <JobCategoryChips
        categories={jobCategoryOptions}
        value={jobCategory}
        onToggle={(name) => setJobCategory(jobCategory === name ? null : name)}
        disabled={isSubmitting}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(theme.spacing.md - insets.top, 0) }]}>
        {/* O1과 같은 가운데 타이틀 툴바 — 2단계부터는 왼쪽에 [이전]이 있다(4.1 위치 일치) */}
        <View style={styles.toolbar}>
          <Pressable
            style={styles.back}
            onPress={handleBackPress}
            accessibilityRole="button"
            accessibilityLabel={COPY.backA11y}
          >
            <ChevronIcon direction="left" size={24} color={theme.color.textPrimary} />
          </Pressable>
          <Text style={styles.toolbarTitle} accessibilityRole="header">
            {ONBOARDING_COPY.career.toolbarTitle}
          </Text>
          {/* [건너뛰기] — 우상단. 보조 위치지만 터치 타깃·본문 크기는 유지한다(4.3) */}
          <Pressable
            style={styles.skip}
            disabled={isSubmitting}
            onPress={handleSkipPress}
            accessibilityRole="button"
            accessibilityLabel={ONBOARDING_COPY.career.skip}
            accessibilityState={{ disabled: isSubmitting }}
          >
            {isSkipSubmitting ? (
              <ActivityIndicator color={theme.color.textSecondary} />
            ) : (
              <Text style={styles.skipLabel}>{ONBOARDING_COPY.career.skip}</Text>
            )}
          </Pressable>
        </View>
        <Text style={styles.stepLabel} accessibilityLabel={COPY.stepA11y}>
          {COPY.step}
        </Text>
        <Text style={styles.title}>{ONBOARDING_COPY.career.title}</Text>
        {/* 손해가 없다는 사실을 상시 노출한다 — 이 문구가 [건너뛰기] 버튼보다 중요하다(onboarding-uiux.md 4.3) */}
        <Text style={styles.laterNotice}>{ONBOARDING_COPY.career.laterNotice}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.form}>
        <Text style={styles.fieldLabel}>{ONBOARDING_COPY.career.jobCategoryLabel}</Text>
        {renderJobCategoryField()}

        <Text style={styles.fieldLabel}>{ONBOARDING_COPY.career.jobTitleLabel}</Text>
        <JobTitleField
          value={jobTitle}
          onChangeText={setJobTitle}
          placeholder={ONBOARDING_COPY.career.jobTitlePlaceholder}
          accessibilityLabel={ONBOARDING_COPY.career.jobTitleLabel}
          clearAccessibilityLabel={ONBOARDING_COPY.career.jobTitleClearA11y}
          disabled={isSubmitting}
        />

        <Text style={styles.fieldLabel}>{ONBOARDING_COPY.career.yearsLabel}</Text>
        {/* 연차 — 커리어 정보와 같은 한 줄 구간 선택. 선택한 칸을 다시 누르면 해제 */}
        <YearsSegment
          options={YEARS_OPTIONS}
          labels={ONBOARDING_COPY.career.yearsOption}
          value={yearsOfExperience}
          onToggle={(option) => setYearsOfExperience(yearsOfExperience === option ? null : option)}
          disabled={isSubmitting}
        />
      </ScrollView>

      <View style={styles.dock}>
        {/* O1과 같은 원형 [다음] — 라벨은 낭독으로만 남는다 */}
        <Pressable
          style={styles.next}
          disabled={isSubmitting}
          onPress={handleNextPress}
          accessibilityRole="button"
          accessibilityLabel={ONBOARDING_COPY.career.next}
          accessibilityState={{ disabled: isSubmitting }}
        >
          {isNextSubmitting ? (
            <ActivityIndicator color={theme.color.onPrimary} />
          ) : (
            <ChevronIcon direction="right" size={28} color={theme.color.onPrimary} />
          )}
        </Pressable>
      </View>
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
    // O1 툴바 타이틀과 동일
    fontSize: 24,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  back: {
    position: 'absolute',
    left: 0,
    top: 0,
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    marginLeft: -theme.spacing.sm,
    paddingLeft: theme.spacing.sm,
  },
  stepLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
    // O1과 동일 — 위(툴바)·아래(헤드라인) 여백을 같게
    marginVertical: theme.spacing.md,
  },
  // O1과 같은 큰 회색 헤드라인
  title: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.xl * 1.35,
  },
  laterNotice: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  form: {
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  // 커리어 정보 화면의 필드 라벨과 같은 값(sm·600·위 md) — 폼이 같은 부품이니 라벨도 같은 결로
  fieldLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginTop: theme.spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chipRowLoading: {
    // 칩 한 줄과 같은 높이여야 로드되는 순간 아래 필드가 밀리지 않는다
    minHeight: JOB_CHIP_HEIGHT,
  },
  // 실제 직군 칩과 같은 크기·모서리(2열 반폭)
  chipSkeleton: {
    width: '48%',
    height: JOB_CHIP_HEIGHT,
    borderRadius: JOB_CHIP_RADIUS,
  },
  chipRowError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  chipRowErrorText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  chipRowRetry: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  chipRowRetryLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
  dock: {
    alignItems: 'flex-end',
    // O1과 동일한 하단 여유
    paddingBottom: theme.spacing.xxl + theme.spacing.lg,
  },
  /** 우상단 텍스트 버튼 — 위치만 보조일 뿐 터치 타깃·글자 크기는 그대로다(4.3) */
  skip: {
    position: 'absolute',
    right: 0,
    top: 0,
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  skipLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textSecondary,
    textDecorationLine: 'underline',
  },
  /** O1과 같은 원형 [다음] */
  next: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderCurve: 'continuous',
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
