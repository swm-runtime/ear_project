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
import FullScreenError from '@/shared/ui/FullScreenError';

import { JOB_TITLE_MAX_LENGTH } from '../career.constants';
import { CAREER_COPY } from '../career.copy';
import type { YearsOfExperienceRange } from '../career.types';
import CareerDialog from '../components/CareerDialog';
import { useCareerInfoScreen } from '../hooks/useCareerInfoScreen';

const YEARS_OPTIONS: YearsOfExperienceRange[] = ['0-1', '2-3', '4-6', '7+'];

/**
 * CR1~CR5 커리어 정보 — 화면은 뷰만 담당하고 로직은 useCareerInfoScreen이 소유한다.
 * 진입 경로는 둘(프로필 카드·설정 콘텐츠)이지만 화면은 하나다(career-uiux.md 3장).
 * 앱바·타이틀은 서버 응답과 무관하므로 로딩 중에도 먼저 그린다(uiux 4.1).
 */
export default function CareerInfoScreen() {
  const screen = useCareerInfoScreen();

  return (
    <SafeAreaView style={styles.container}>
      {/* 앱바 — 뒤로가기 + "커리어 정보" + 우측 [초기화]. [저장](하단 독)과 오탭 거리를 두는
          배치가 확인 팝업 없는 즉시 실행의 전제다(career-uiux.md 4.2) */}
      <View style={styles.appBar}>
        <Pressable
          style={styles.backButton}
          onPress={screen.handleBackPress}
          accessibilityRole="button"
          accessibilityLabel={CAREER_COPY.backA11y}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appBarTitle} accessibilityRole="header">
          {CAREER_COPY.appBarTitle}
        </Text>
        <Pressable
          style={styles.resetButton}
          disabled={!screen.canReset}
          onPress={screen.resetForm}
          accessibilityRole="button"
          accessibilityLabel={CAREER_COPY.resetA11yLabel}
          accessibilityHint={CAREER_COPY.resetA11yHint}
          accessibilityState={{ disabled: !screen.canReset }}
        >
          <Text style={[styles.resetLabel, !screen.canReset && styles.resetLabelDisabled]}>
            {CAREER_COPY.reset}
          </Text>
        </Pressable>
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
            {screen.isLoading ? (
              screen.showSkeleton ? (
                <>
                  <View style={styles.skeletonNotice} />
                  <View style={styles.skeletonField} />
                  <View style={styles.skeletonField} />
                  <View style={styles.skeletonField} />
                </>
              ) : null
            ) : (
              <>
                {/* 미입력이면 유도 문구, 입력됨이면 용도 안내 — 분기 기준은 서버 값이다(uiux 4.1·4.3) */}
                <Text style={styles.notice}>
                  {screen.isServerEmpty ? CAREER_COPY.emptyNotice : CAREER_COPY.purposeNotice}
                </Text>

                <Text style={styles.fieldLabel}>{CAREER_COPY.jobCategoryLabel}</Text>
                {/* 온보딩 O4와 같은 칩 선택형(변경 2026-08-12 — 바텀시트에서 통일). 선택지는
                    서버 목록을 받은 순서대로 그린다. 재탭 해제가 값을 비우는 경로다 */}
                <View style={styles.chipRow}>
                  {screen.jobCategories.map((category) => {
                    const isSelected = screen.jobCategory === category.name;
                    return (
                      <Pressable
                        key={category.name}
                        style={[styles.chip, isSelected && styles.chipSelected]}
                        disabled={screen.isSaving}
                        onPress={() => screen.toggleJobCategory(category.name)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isSelected, disabled: screen.isSaving }}
                        accessibilityLabel={category.name}
                      >
                        <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
                          {category.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>{CAREER_COPY.jobTitleLabel}</Text>
                {/* 상한에서 추가 입력을 받지 않는다. 카운터·에러 문구는 두지 않는다(uiux 4.4) */}
                <TextInput
                  style={styles.input}
                  value={screen.jobTitle}
                  onChangeText={screen.changeJobTitle}
                  editable={!screen.isSaving}
                  placeholder={CAREER_COPY.jobTitlePlaceholder}
                  placeholderTextColor={theme.color.textSecondary}
                  maxLength={JOB_TITLE_MAX_LENGTH}
                  accessibilityLabel={CAREER_COPY.jobTitleLabel}
                />

                <Text style={styles.fieldLabel}>{CAREER_COPY.yearsLabel}</Text>
                <View style={styles.chipRow}>
                  {YEARS_OPTIONS.map((option) => {
                    const isSelected = screen.yearsOfExperience === option;
                    return (
                      <Pressable
                        key={option}
                        style={[styles.chip, isSelected && styles.chipSelected]}
                        disabled={screen.isSaving}
                        onPress={() => screen.toggleYears(option)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isSelected, disabled: screen.isSaving }}
                        accessibilityLabel={CAREER_COPY.yearsChip[option]}
                      >
                        <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
                          {CAREER_COPY.yearsChip[option]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
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
                style={styles.save}
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
                style={[styles.save, !screen.canSave && styles.saveDisabled]}
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
        primaryAction={{ label: CAREER_COPY.leaveConfirm.leave, onPress: screen.leaveWithoutSaving }}
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
  resetButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
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
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
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
  input: {
    minHeight: theme.touchTarget.minHeight,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    minHeight: theme.touchTarget.minHeight,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg + theme.radius.sm,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: theme.color.primary,
    backgroundColor: theme.color.primary,
  },
  chipLabel: {
    fontSize: theme.font.size.sm,
    // 선택 여부와 무관하게 굵기를 고정한다 — 선택 시 굵어지면 글자 폭이 변해
    // flexWrap 줄의 뒤 칩들이 밀린다(주제 칩과 같은 규칙 — onboarding-uiux.md 7장)
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  chipLabelSelected: {
    color: theme.color.onPrimary,
  },
  skeletonNotice: {
    width: 180,
    height: theme.font.size.sm * 1.4,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
  skeletonField: {
    height: theme.touchTarget.minHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
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
