import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import FullScreenError from '@/shared/ui/FullScreenError';
import GlassCapsule, { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import { SkeletonBlock, SkeletonGroup } from '@/shared/ui/Skeleton';
import { Text, TextInput } from '@/shared/ui/Typography';

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
  // 저장 실패(CR4)면 [완료]가 같은 편집 값으로 다시 보낸다 — 변경 있음 판정과 무관하게 켜 둔다
  const isRetry = screen.saveError?.isRetryable === true;
  const canDone = !screen.isSaving && (isRetry || screen.canSave);

  return (
    <SafeAreaView style={styles.container}>
      {/*
        앱바 — **iOS 편집 화면 문법**(PM 2026-10-10 A안): 왼쪽 [취소] · 가운데 제목 · 오른쪽 [완료]. 종전 하단 독 [저장]과
        앱바 [초기화]를 대신한다. [취소]는 뒤로가기와 같다(변경 있으면 이탈 확인 CR5). [완료]는 변경 있을 때만 켜지고(값 비교 —
        uiux 4.1), 저장 실패 뒤에는 같은 편집 값으로 다시 보낸다(CR4). [모두 지우기]는 [완료]에서 먼 폼 맨 아래다(오탭 거리, 4.2)
      */}
      <View style={styles.appBar}>
        <GlassCapsule style={styles.barCapsule}>
          <Pressable
            style={styles.barButton}
            onPress={screen.handleBackPress}
            disabled={screen.isSaving}
            accessibilityRole="button"
            accessibilityLabel={CAREER_COPY.cancel}
            hitSlop={BAR_HIT_SLOP}
          >
            <Text style={styles.barLabel}>{CAREER_COPY.cancel}</Text>
          </Pressable>
        </GlassCapsule>
        {/* 터치를 통과시키는 View 로 감싼다 — Android 의 Text 는 pointerEvents 를 따르지 않아, 줄 전체에 겹친 제목이 버튼
            탭을 가로챌 수 있다(AndroidCollapsingBar 제목과 같은 이유, 2026-09-30) */}
        <View style={styles.appBarTitleBox} pointerEvents="none">
          <Text style={styles.appBarTitle} accessibilityRole="header">
            {CAREER_COPY.appBarTitle}
          </Text>
        </View>
        <View style={styles.appBarFill} />
        <GlassCapsule style={styles.barCapsule}>
          <Pressable
            style={styles.barButton}
            disabled={!canDone}
            onPress={isRetry ? screen.retrySave : screen.handleSavePress}
            accessibilityRole="button"
            accessibilityLabel={CAREER_COPY.done}
            accessibilityState={{ disabled: !canDone, busy: screen.isSaving }}
            hitSlop={BAR_HIT_SLOP}
          >
            {screen.isSaving ? (
              <ActivityIndicator color={theme.color.textPrimary} />
            ) : (
              <Text
                style={[styles.barLabel, styles.doneLabel, !canDone && styles.barLabelDisabled]}
              >
                {CAREER_COPY.done}
              </Text>
            )}
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
                {/* 연차 — 칸이 고정된 4택이라 **한 줄 구간 선택**(세그먼트, PM 2026-10-10 A안). 줄바꿈 칩보다 같은 질문의 답으로
                    읽힌다. 선택한 칸을 다시 누르면 해제(빈 값 저장 경로 — uiux 4.4)는 그대로다 */}
                <View style={styles.segment}>
                  {YEARS_OPTIONS.map((option) => {
                    const isSelected = screen.yearsOfExperience === option;
                    return (
                      <Pressable
                        key={option}
                        style={[styles.segmentItem, isSelected && styles.segmentItemSelected]}
                        disabled={screen.isSaving}
                        onPress={() => screen.toggleYears(option)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isSelected, disabled: screen.isSaving }}
                        accessibilityLabel={CAREER_COPY.yearsChip[option]}
                      >
                        <Text
                          style={[styles.segmentLabel, isSelected && styles.segmentLabelSelected]}
                          numberOfLines={1}
                        >
                          {CAREER_COPY.yearsChip[option]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {screen.saveError !== null ? (
                  // CR4 — 폼 하단 인라인 에러. 사용자가 시작한 저장의 직접 결과라 assertive다(uiux 7장)
                  <Text style={styles.saveError} accessibilityLiveRegion="assertive">
                    {screen.saveError.message}
                  </Text>
                ) : null}

                {/* [모두 지우기] — 종전 앱바 [초기화]. [완료]와 먼 폼 맨 아래라 확인 팝업 없이 즉시 비운다(uiux 4.2) */}
                <Pressable
                  style={styles.clearButton}
                  disabled={!screen.canReset || screen.isSaving}
                  onPress={screen.resetForm}
                  accessibilityRole="button"
                  accessibilityLabel={CAREER_COPY.resetA11yLabel}
                  accessibilityHint={CAREER_COPY.resetA11yHint}
                  accessibilityState={{ disabled: !screen.canReset || screen.isSaving }}
                >
                  <Text style={[styles.clearLabel, !screen.canReset && styles.barLabelDisabled]}>
                    {CAREER_COPY.reset}
                  </Text>
                </Pressable>
              </>
            )}
          </ScrollView>
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

/** 보이는 40 을 터치 44 로 채운다(design.md §6) */
const BAR_HIT_SLOP = 2;

/** 구간 선택 트랙 안쪽 여백 */
const SEGMENT_INSET = 3;

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
  appBarTitleBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appBarTitle: {
    textAlign: 'center',
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  // 유리 알약은 머리 줄 컨트롤 높이(40)를 쓰고, 44 터치는 안쪽 Pressable 의 hitSlop 이 채운다
  barCapsule: {
    height: HEADER_CONTROL_HEIGHT,
  },
  appBarFill: { flex: 1 },
  barButton: {
    flex: 1,
    minWidth: HEADER_CONTROL_HEIGHT + theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  barLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '500',
    color: theme.color.textPrimary,
  },
  // [완료] — 주 동작이라 굵게(iOS 편집 화면의 완료와 같다)
  doneLabel: {
    fontWeight: '700',
  },
  barLabelDisabled: {
    opacity: 0.35,
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
    borderCurve: 'continuous',
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
    borderCurve: 'continuous',
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
  // 연차 한 줄 구간 선택 — 옅은 트랙 위에 고른 칸만 검정(직군 칩의 선택과 같은 색)
  segment: {
    flexDirection: 'row',
    padding: SEGMENT_INSET,
    gap: SEGMENT_INSET,
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
  },
  segmentItem: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight - SEGMENT_INSET * 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
  },
  segmentItemSelected: {
    backgroundColor: theme.color.primary,
  },
  segmentLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  segmentLabelSelected: {
    color: theme.color.onPrimary,
  },
  saveError: {
    marginTop: theme.spacing.md,
    fontSize: theme.font.size.sm,
    color: theme.color.danger,
  },
  // [모두 지우기] — 폼 맨 아래 가운데 글자 버튼(파괴적 빨강 아님 — 저장 전 로컬 편집이라 잃는 것이 없다, uiux 4.2)
  clearButton: {
    alignSelf: 'center',
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.xl,
  },
  clearLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
});
