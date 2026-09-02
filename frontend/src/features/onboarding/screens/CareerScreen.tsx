import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';

import StepIndicator from '../components/StepIndicator';
import { useCareerScreen } from '../hooks/useCareerScreen';
import { ONBOARDING_COPY } from '../onboarding.copy';
import type { YearsOfExperience } from '../onboarding.types';

const YEARS_OPTIONS: YearsOfExperience[] = ['0-1', '2-3', '4-6', '7+'];

/**
 * O4 커리어 정보(2/3). 전부 선택 항목 — 미입력 필드에 에러 표시를 하지 않고
 * [다음]은 입력값과 무관하게 항상 활성이다(onboarding-uiux.md 4.3).
 */
export default function CareerScreen() {
  const insets = useSafeAreaInsets();
  const {
    jobCategory,
    jobTitle,
    yearsOfExperience,
    jobCategoryOptions,
    isJobCategoriesLoading,
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
      return <ActivityIndicator style={styles.chipRowLoading} color={theme.color.primary} />;
    }
    if (isJobCategoriesError) {
      return (
        <View style={styles.chipRowError}>
          <Text style={styles.chipRowErrorText}>{ONBOARDING_COPY.career.jobCategoryLoadFailed}</Text>
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
      <View style={styles.chipRow}>
        {jobCategoryOptions.map((option) => {
          const isSelected = jobCategory === option;
          return (
            <Pressable
              key={option}
              style={[styles.optionChip, isSelected && styles.optionChipSelected]}
              onPress={() => setJobCategory(isSelected ? null : option)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={option}
            >
              <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(theme.spacing.md - insets.top, 0) }]}>
        <Pressable
          style={styles.back}
          onPress={handleBackPress}
          accessibilityRole="button"
          accessibilityLabel="이전 단계로"
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <StepIndicator current={2} />
        <Text style={styles.title}>{ONBOARDING_COPY.career.title}</Text>
        {/* 손해가 없다는 사실을 상시 노출한다 — 이 문구가 [건너뛰기] 버튼보다 중요하다(onboarding-uiux.md 4.3) */}
        <Text style={styles.laterNotice}>{ONBOARDING_COPY.career.laterNotice}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.form}>
        <Text style={styles.fieldLabel}>{ONBOARDING_COPY.career.jobCategoryLabel}</Text>
        {renderJobCategoryField()}

        <Text style={styles.fieldLabel}>{ONBOARDING_COPY.career.jobTitleLabel}</Text>
        <TextInput
          style={styles.input}
          value={jobTitle}
          onChangeText={setJobTitle}
          placeholder={ONBOARDING_COPY.career.jobTitlePlaceholder}
          placeholderTextColor={theme.color.textSecondary}
          maxLength={100}
          accessibilityLabel={ONBOARDING_COPY.career.jobTitleLabel}
        />

        <Text style={styles.fieldLabel}>{ONBOARDING_COPY.career.yearsLabel}</Text>
        <View style={styles.chipRow}>
          {YEARS_OPTIONS.map((option) => {
            const isSelected = yearsOfExperience === option;
            return (
              <Pressable
                key={option}
                style={[styles.optionChip, isSelected && styles.optionChipSelected]}
                onPress={() => setYearsOfExperience(isSelected ? null : option)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={ONBOARDING_COPY.career.yearsOption[option]}
              >
                <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                  {ONBOARDING_COPY.career.yearsOption[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.dock}>
        {/* [건너뛰기]는 보조 스타일로 두되 숨기거나 작게 만들지 않는다(onboarding-uiux.md 4.3) */}
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
            <Text style={styles.nextLabel}>{ONBOARDING_COPY.career.next}</Text>
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
  back: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    marginLeft: -theme.spacing.sm,
    paddingLeft: theme.spacing.sm,
  },
  backIcon: {
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.xl,
  },
  title: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.lg * 1.4,
    marginTop: theme.spacing.md,
  },
  laterNotice: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  form: {
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  // 글자 크기는 주제 선택(1/3)에 맞추고 높이·여백은 그보다 한 칸 낮춘다 —
  // 이 화면은 칩·입력이 여러 줄이라 같은 크기로 키우면 폼이 화면을 넘어간다(2026-09-02)
  fieldLabel: {
    fontSize: theme.font.size.md,
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
    alignSelf: 'flex-start',
    // 칩과 같은 높이여야 로드되는 순간 아래 필드가 밀리지 않는다
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
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
  // 주제 칩보다 한 칸 낮다(60 → 52). 좌우 여백도 16을 유지한다 —
  // "0-1년"처럼 짧은 라벨이 24 여백을 받으면 내용보다 여백이 넓어진다
  optionChip: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionChipSelected: {
    borderColor: theme.color.primary,
    backgroundColor: theme.color.primary,
  },
  optionLabel: {
    fontSize: theme.font.size.md,
    // 선택 여부와 무관하게 굵기를 고정한다 — 선택 시 굵어지면 글자 폭이 변해
    // flexWrap 줄의 뒤 칩들이 밀린다(주제 칩과 같은 규칙 — onboarding-uiux.md 7장)
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  optionLabelSelected: {
    color: theme.color.onPrimary,
  },
  input: {
    // 칩과 같은 높이로 세운다 — 한 폼 안에서 요소 높이가 다르면 줄이 어긋나 보인다
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  dock: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  skip: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  next: {
    flex: 2,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
