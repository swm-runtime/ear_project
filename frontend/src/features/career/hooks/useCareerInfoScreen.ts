import {
  useNavigation,
  type NavigationAction,
  type ParamListBase,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { useToastStore } from '@/shared/ui/toast.store';

import { CAREER_COPY } from '../career.copy';
import type { CareerInfo, YearsOfExperienceRange } from '../career.types';
import { useJobCategoriesQuery } from './useJobCategoriesQuery';
import { useMyCareerQuery } from './useMyCareerQuery';
import { useSaveCareerMutation } from './useSaveCareerMutation';
import {
  hasCareerFormChanges,
  isCareerEmpty,
  isCareerFormEmpty,
  toCareerInfoFromForm,
} from '../services/career-edit';

/** CR4 인라인 에러 — [다시 시도]는 같은 편집 값의 재전송이 의미 있는 실패에만 붙는다 */
interface SaveError {
  message: string;
  isRetryable: boolean;
}

/**
 * 커리어 정보 화면(CR1~CR5)의 로직 소유자 — 화면은 뷰만 담당한다.
 *
 * 편집은 일괄이다: 필드 조작·[초기화]는 로컬 상태만 바꾸고, [저장] 시점에 3필드 전체를
 * 보낸다(career.md 4.1 — 필드 단위 자동 저장 금지). 변경 있음 판정은 탭 이력이 아니라
 * 서버 값과의 필드 단위 값 비교다(career-uiux.md 4.1).
 */
export const useCareerInfoScreen = () => {
  // setOptions(gestureEnabled)를 쓰기 위한 native-stack 타이핑 — 파람 목록은 app 소유라 모른다
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const showToast = useToastStore((s) => s.show);
  const careerQuery = useMyCareerQuery();
  const categoriesQuery = useJobCategoriesQuery();
  const saveMutation = useSaveCareerMutation();

  const [jobCategory, setJobCategory] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState<YearsOfExperienceRange | null>(null);
  /** 사용자가 이번 진입에서 폼을 만졌는가 — 만지기 전에는 서버 재조회 값으로 폼을 따라간다 */
  const [isDirty, setIsDirty] = useState(false);
  /** 마지막으로 폼에 반영한 서버 응답(참조 비교) — 캐시 하이드레이션 후 재조회 값이 덮는다 */
  const [hydratedServer, setHydratedServer] = useState<CareerInfo | null>(null);
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  /** CR5 — 가로챈 이탈 액션. null이 아니면 이탈 팝업이 떠 있다 */
  const [pendingLeaveAction, setPendingLeaveAction] = useState<NavigationAction | null>(null);
  /** 저장 성공·[나가기] 확정 후의 이탈은 가로채지 않는다 */
  const allowLeaveRef = useRef(false);

  const serverCareer = careerQuery.data ?? null;
  // 파생 초기화를 렌더 중에 수행한다 — effect의 동기 setState를 피한다(interest 훅과 같은 패턴).
  // 편집 전(isDirty=false)에는 재조회 값도 그대로 따라간다 — 캐시로 먼저 그려진 폼이 다른
  // 기기의 저장(last-write-wins)과 어긋나 사용자가 만들지 않은 "변경 사항"이 되지 않게 한다
  if (serverCareer !== null && hydratedServer !== serverCareer && !isDirty) {
    setHydratedServer(serverCareer);
    setJobCategory(serverCareer.jobCategory);
    setJobTitle(serverCareer.jobTitle ?? '');
    setYearsOfExperience(serverCareer.yearsOfExperience);
  }

  const form = useMemo(
    () => ({ jobCategory, jobTitle, yearsOfExperience }),
    [jobCategory, jobTitle, yearsOfExperience],
  );

  const isLoading =
    careerQuery.isPending || categoriesQuery.isPending || hydratedServer === null;
  // 어느 한쪽 실패 시 전체 화면 에러다(career-api.md 6장) — 절반만 그려진 폼에서 편집을 시작하게 하지 않는다
  const isError = careerQuery.isError || categoriesQuery.isError;
  const isSaving = saveMutation.isPending;

  /** 유도 문구 분기의 기준은 서버 값이다(career.md 5장) — 편집 중에는 바뀌지 않는다 */
  const isServerEmpty = serverCareer !== null && isCareerEmpty(serverCareer);

  const hasChanges = serverCareer !== null && hasCareerFormChanges(serverCareer, form);
  const canSave = hasChanges && !isLoading && !isError && !isSaving;
  /** [초기화] 활성 기준은 편집 중인 폼이다(career-uiux.md 4.2). 로딩·저장 중 비활성 */
  const canReset = !isLoading && !isError && !isSaving && !isCareerFormEmpty(form);

  const jobCategories = categoriesQuery.data ?? [];

  /** 실패 후 편집을 이어가면 인라인 에러를 지운다 — "다시 시도"가 가리키던 요청이 더는 없다(uiux 4.5) */
  const beginEdit = () => {
    setIsDirty(true);
    setSaveError(null);
  };

  /**
   * 직군 칩 — 온보딩 O4와 같은 칩 선택형이다(변경 2026-08-12 — 바텀시트에서 통일).
   * 단일 선택, 선택된 칩을 다시 탭하면 해제된다 — 재탭 해제가 값을 비우는 경로다.
   * 이 시점에 저장되지 않는다(반영은 [저장]에서 일괄). 저장 중 조작 차단(career-uiux.md 4.4)
   */
  const toggleJobCategory = (name: string) => {
    if (isSaving) return;
    beginEdit();
    setJobCategory((current) => (current === name ? null : name));
  };

  const changeJobTitle = (text: string) => {
    if (isSaving) return;
    beginEdit();
    setJobTitle(text);
  };

  /** 연차 칩 — 단일 선택, 선택된 칩을 다시 탭하면 해제된다(career-uiux.md 4.4) */
  const toggleYears = (option: YearsOfExperienceRange) => {
    if (isSaving) return;
    beginEdit();
    setYearsOfExperience((current) => (current === option ? null : option));
  };

  /** [초기화] — 전 필드 비움, 확인 팝업 없이 즉시. 비운 상태는 변경 있음으로 취급된다(career.md 4.1) */
  const resetForm = () => {
    if (!canReset) return;
    beginEdit();
    setJobCategory(null);
    setJobTitle('');
    setYearsOfExperience(null);
    // 시각적으론 세 필드가 동시에 비지만 스크린리더엔 무음이다 — 한 번 알린다(uiux 7장)
    AccessibilityInfo.announceForAccessibility(CAREER_COPY.resetAnnouncement);
  };

  const executeSave = () => {
    if (isSaving) return;
    setSaveError(null);
    saveMutation.mutate(toCareerInfoFromForm(form), {
      onSuccess: () => {
        // 성공 토스트는 화면 복귀와 함께 띄운다(career-uiux.md 4.7) — 완료 화면을 두지 않는다
        allowLeaveRef.current = true;
        showToast(CAREER_COPY.saveSuccessToast);
        navigation.goBack();
      },
      onError: (error) => {
        if (isApiError(error)) {
          // 목록 밖 직군 — 든 목록이 낡았다는 뜻이라 재조회가 복구 경로다(career-api.md 5장).
          // 직군만 선택 안 함으로 되돌리고 직무·연차 편집 값은 유지한다
          if (error.errorCode === ERROR_CODES.CAREER_JOB_CATEGORY_UNAVAILABLE) {
            void categoriesQuery.refetch();
            setIsDirty(true);
            setJobCategory(null);
            setSaveError({ message: error.message, isRetryable: false });
            return;
          }
          // 형식 위반 — 입력을 고치라는 뜻이라 재시도를 권하지 않는다(career-api.md 5장)
          if (error.errorCode === ERROR_CODES.VALIDATION_FAILED) {
            setSaveError({ message: error.message, isRetryable: false });
            return;
          }
        }
        // 타임아웃·5xx(자동 재시도 소진)·오프라인 — 인라인 에러 + [다시 시도], 편집 상태 유지(CR4).
        // 폼 제출은 오프라인 큐에 넣지 않는다(common-error-handling.md 4.5)
        setSaveError({ message: CAREER_COPY.saveFailed, isRetryable: true });
      },
    });
  };

  const handleSavePress = () => {
    // 확인 팝업 없이 저장한다(career.md 4.2) — 잃는 것이 없어 확인할 내용이 없다
    if (!canSave) return;
    executeSave();
  };

  /** CR4 [다시 시도] — 같은 편집 값으로 저장을 다시 보낸다. 인플라이트 중 연타는 무시한다 */
  const retrySave = () => executeSave();

  // beforeRemove 구독은 한 번만 하고 최신 상태는 ref로 읽는다 — 재구독 없이 가로챈다
  const hasChangesRef = useRef(hasChanges);
  const isSavingRef = useRef(isSaving);
  useEffect(() => {
    hasChangesRef.current = hasChanges;
    isSavingRef.current = isSaving;
  }, [hasChanges, isSaving]);

  // native-stack의 스와이프 백은 제스처가 네이티브에서 확정돼 beforeRemove로 막을 수 없다 —
  // 변경·저장 중에는 제스처 자체를 끈다. 제스처만 이탈 팝업을 우회하면 확인 규칙이 입력
  // 수단에 따라 달라진다(career-uiux.md 4.6)
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !hasChanges && !isSaving });
  }, [navigation, hasChanges, isSaving]);

  useEffect(() => {
    // 변경이 있으면 뒤로가기(버튼·하드웨어 백)를 가로채 이탈 팝업을 띄운다(CR5). 변경이 없으면 그대로 나간다
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current || !hasChangesRef.current) return;
      event.preventDefault();
      // 저장 인플라이트 동안은 이탈 자체를 차단한다 — 도중 이탈하면 결과를 확인할 화면이 없다(uiux 4.4)
      if (isSavingRef.current) return;
      setPendingLeaveAction(event.data.action);
    });
    return unsubscribe;
  }, [navigation]);

  /** 앱바 뒤로가기 — 가로채기는 beforeRemove 한 곳에서 일관되게 처리된다 */
  const handleBackPress = () => navigation.goBack();

  const stayEditing = () => setPendingLeaveAction(null);

  /** [나가기] — 편집을 폐기하고 이전 화면으로. 서버 값은 그대로다(아무것도 전송된 적이 없다) */
  const leaveWithoutSaving = () => {
    const action = pendingLeaveAction;
    setPendingLeaveAction(null);
    allowLeaveRef.current = true;
    if (action) navigation.dispatch(action);
  };

  const refetchAll = () => {
    if (careerQuery.isError) void careerQuery.refetch();
    if (categoriesQuery.isError) void categoriesQuery.refetch();
  };

  return {
    jobCategory,
    jobTitle,
    yearsOfExperience,
    jobCategories,
    isServerEmpty,
    hasChanges,
    canSave,
    canReset,
    isSaving,
    /** 필드 스켈레톤 — 0.3초 미만이면 표시하지 않는다(career-uiux.md 4.1) */
    showSkeleton: useDelayedVisible(isLoading),
    isLoading,
    isError,
    isRefetching: careerQuery.isRefetching || categoriesQuery.isRefetching,
    saveError,
    isLeaveConfirmVisible: pendingLeaveAction !== null,
    toggleJobCategory,
    changeJobTitle,
    toggleYears,
    resetForm,
    handleSavePress,
    retrySave,
    handleBackPress,
    stayEditing,
    leaveWithoutSaving,
    refetchAll,
  };
};
