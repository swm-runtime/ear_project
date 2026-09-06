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
import ChevronIcon from '@/shared/ui/ChevronIcon';

import { useCareerScreen } from '../hooks/useCareerScreen';
import { ONBOARDING_COPY } from '../onboarding.copy';
import type { YearsOfExperience } from '../onboarding.types';

const YEARS_OPTIONS: YearsOfExperience[] = ['0-1', '2-3', '4-6', '7+'];

/**
 * O4 커리어 정보(2/3). 전부 선택 항목 — 미입력 필드에 에러 표시를 하지 않고
 * [다음]은 입력값과 무관하게 항상 활성이다(onboarding-uiux.md 4.3).
 * 시각은 O1과 같은 컨셉(2026-09-03): 가운데 타이틀 툴바(+뒤로가기) · "2/3 단계" ·
 * 큰 회색 헤드라인 · 면(面) 칩 · 우하단 원형 [다음] + 왼쪽 [건너뛰기] 텍스트 버튼.
 * [건너뛰기]는 보조 스타일이되 숨기거나 작게 만들지 않는다(4.3).
 * 문서 반영 요청: changes/pending/onboarding-o1-visual-refresh.md
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
        {/* O1과 같은 가운데 타이틀 툴바 — 2단계부터는 왼쪽에 [이전]이 있다(4.1 위치 일치) */}
        <View style={styles.toolbar}>
          <Pressable
            style={styles.back}
            onPress={handleBackPress}
            accessibilityRole="button"
            accessibilityLabel="이전 단계로"
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
        <Text style={styles.stepLabel} accessibilityLabel="3단계 중 2단계">
          2/3 단계
        </Text>
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
  fieldLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    // 필드 사이 호흡 — 섹션 경계가 분명해야 폼이 세 질문으로 읽힌다
    marginTop: theme.spacing.xl,
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
  // O1 알약과 같은 "면" 문법 — 테두리 대신 은은한 면, 선택은 primary 채움
  optionChip: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionChipSelected: {
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
    // 칩과 같은 높이·같은 면 문법 — 한 폼 안에서 요소 결이 다르면 줄이 어긋나 보인다
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
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
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
