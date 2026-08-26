import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
      <View style={styles.header}>
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
    paddingTop: theme.spacing.md,
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
    alignSelf: 'flex-start',
    minHeight: theme.touchTarget.minHeight,
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
  optionChip: {
    minHeight: theme.touchTarget.minHeight,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg + theme.radius.sm,
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
    fontSize: theme.font.size.sm,
    // 선택 여부와 무관하게 굵기를 고정한다 — 선택 시 굵어지면 글자 폭이 변해
    // flexWrap 줄의 뒤 칩들이 밀린다(주제 칩과 같은 규칙 — onboarding-uiux.md 7장)
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  optionLabelSelected: {
    color: theme.color.onPrimary,
  },
  input: {
    minHeight: theme.touchTarget.minHeight,
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
    paddingBottom: theme.spacing.md,
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
