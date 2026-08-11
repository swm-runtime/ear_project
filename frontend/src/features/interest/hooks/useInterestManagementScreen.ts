import {
  useNavigation,
  type NavigationAction,
  type ParamListBase,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { useToastStore } from '@/shared/ui/toast.store';

import { INTEREST_COPY } from '../interest.copy';
import { useMyInterestsQuery } from './useMyInterestsQuery';
import { useSaveInterestsMutation } from './useSaveInterestsMutation';
import { useTopicsQuery } from './useTopicsQuery';
import {
  computeInterestDiff,
  filterToVisible,
  isOverSelectionCap,
} from '../services/interest-edit';

/**
 * 관심사 관리 화면(IM1~IM9)의 로직 소유자 — 화면은 뷰만 담당한다.
 *
 * 편집은 일괄(batch)이다: 칩 탭은 로컬 상태만 바꾸고, [저장] 시점에 최종 목록 전체를
 * 보낸다(interest-management.md 3장). 화면의 상한 처리는 안내이지 검증이 아니다 —
 * 판정은 저장 시점에 서버가 다시 한다(uiux 1장).
 */
export const useInterestManagementScreen = () => {
  // setOptions(gestureEnabled)를 쓰기 위한 native-stack 타이핑 — 파람 목록은 app 소유라 모른다
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const showToast = useToastStore((s) => s.show);
  const topicsQuery = useTopicsQuery();
  const interestsQuery = useMyInterestsQuery();
  const saveMutation = useSaveInterestsMutation();

  /** null = 서버 관심사로 아직 초기화되지 않음 */
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  /** 사용자가 이번 진입에서 칩을 만졌는가 — 만지기 전에는 서버 재조회 값으로 선택을 따라간다 */
  const [isDirty, setIsDirty] = useState(false);
  /** 마지막으로 선택에 반영한 서버 응답(참조 비교) — 캐시 하이드레이션 후 재조회 값이 덮는다 */
  const [hydratedServerIds, setHydratedServerIds] = useState<string[] | null>(null);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  /** 해제 확인을 이미 마쳤는가 — 실패 후 재시도는 같은 저장의 반복이라 팝업을 다시 띄우지 않는다(uiux 4.7) */
  const [isRemovalConfirmed, setIsRemovalConfirmed] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  /** IM7 — 가로챈 이탈 액션. null이 아니면 이탈 팝업이 떠 있다 */
  const [pendingLeaveAction, setPendingLeaveAction] = useState<NavigationAction | null>(null);
  /** 저장 성공·[나가기] 확정 후의 이탈은 가로채지 않는다 */
  const allowLeaveRef = useRef(false);

  const serverIds = useMemo(
    () => interestsQuery.data?.map((interest) => interest.topicId) ?? null,
    [interestsQuery.data],
  );
  // 파생 초기화를 렌더 중에 수행한다 — effect의 동기 setState를 피한다(useDelayedVisible와 같은 패턴).
  // 편집 전(isDirty=false)에는 재조회 값도 그대로 따라간다 — 재진입 시 캐시로 먼저 그려진 선택이
  // 다른 기기의 저장(last-write-wins)과 어긋나 사용자가 만들지 않은 "변경 사항"이 되지 않게 한다
  if (serverIds !== null && hydratedServerIds !== serverIds && !isDirty) {
    setHydratedServerIds(serverIds);
    setSelectedIds(serverIds);
  }

  const visibleTopicIds = useMemo(
    () => new Set((topicsQuery.data?.items ?? []).map((topic) => topic.topicId)),
    [topicsQuery.data],
  );
  /**
   * 개수·diff·저장 본문은 전부 노출 중인 주제로 한정한다(interest-management.md 7장 —
   * 숨겨진 주제 제외). INTEREST_TOPIC_UNAVAILABLE 후의 재조회에서 사라진 주제의 선택이
   * 자동으로 걷어내진다(uiux — 편집 상태 재구성).
   */
  const effectiveSelected = useMemo(
    () => filterToVisible(selectedIds ?? [], visibleTopicIds),
    [selectedIds, visibleTopicIds],
  );
  const baseline = useMemo(
    () => filterToVisible(serverIds ?? [], visibleTopicIds),
    [serverIds, visibleTopicIds],
  );
  const diff = useMemo(
    () => computeInterestDiff(baseline, effectiveSelected),
    [baseline, effectiveSelected],
  );

  const maxSelectable = topicsQuery.data?.maxSelectable ?? 0;
  const selectedCount = effectiveSelected.length;
  /**
   * 상한 초과는 탭이 아니라 저장을 막는다(변경 2026-08-11 — 0개 상태와 같은 패턴).
   * 판정식은 서버와 같은 max(상한, 기존 보유 개수)라 초과 보유자의 해제·재저장(5→4)은 통과한다.
   */
  const isOverLimit = isOverSelectionCap(selectedCount, maxSelectable, baseline.length);
  /** IM6 — 초과 보유자(기존 4개 이상) 안내 배너. N은 3을 초과한 개수, 3개 이하로 내려가면 제거 */
  const overLimitCount =
    maxSelectable > 0 && baseline.length > maxSelectable
      ? Math.max(0, selectedCount - maxSelectable)
      : 0;

  const isLoading = topicsQuery.isPending || interestsQuery.isPending || selectedIds === null;
  const isError = topicsQuery.isError || interestsQuery.isError;
  const isSaving = saveMutation.isPending;

  const hasChanges = diff.changeCount > 0;
  /** 0개 상태는 탭이 아니라 저장을 막는다(개정 2026-08-09) — 비활성 사유 문구는 상시 노출 */
  const isBelowMin = selectedCount < 1;
  const canSave =
    hasChanges && !isBelowMin && !isOverLimit && !isLoading && !isError && !isSaving;

  // 선택 개수 제한으로 칩을 비활성 처리하지 않는다(변경 2026-08-11) — 막는 것은 탭이 아니라 저장이다
  const topics = (topicsQuery.data?.items ?? []).map((topic) => ({
    ...topic,
    isSelected: effectiveSelected.includes(topic.topicId),
  }));

  const toggleTopic = (topicId: string) => {
    // 저장 인플라이트 동안 화면 조작을 차단한다 — 보낸 목록과 화면이 어긋나면 안 된다(uiux 4.3)
    if (isSaving || selectedIds === null) return;
    setIsDirty(true);
    setSaveErrorMessage(null);
    // 편집이 달라졌으니 다음 저장은 새 저장이다 — 해제 확인도 다시 받는다
    setIsRemovalConfirmed(false);
    if (effectiveSelected.includes(topicId)) {
      setSelectedIds(selectedIds.filter((id) => id !== topicId));
      return;
    }
    setSelectedIds([...selectedIds, topicId]);
  };

  const executeSave = () => {
    if (isSaving) return;
    setSaveErrorMessage(null);
    saveMutation.mutate(
      { topicIds: effectiveSelected },
      {
        onSuccess: () => {
          // 성공 토스트는 화면 복귀와 함께 띄운다(uiux 5장) — 복귀를 지연시키지 않는다
          allowLeaveRef.current = true;
          showToast(INTEREST_COPY.saveSuccessToast);
          navigation.goBack();
        },
        onError: (error) => {
          if (isApiError(error)) {
            // 상한 거부 — 재조회로 선택 상태를 서버와 재동기화한다(interest-management-api.md 5장)
            if (error.errorCode === ERROR_CODES.INTEREST_LIMIT_EXCEEDED) {
              showToast(error.message);
              setIsRemovalConfirmed(false);
              // 편집 이전 상태로 되돌린다 — 재조회 값이 렌더 단계의 하이드레이션으로 선택을 덮는다
              setIsDirty(false);
              void interestsQuery.refetch();
              return;
            }
            // 사라진 주제 포함 — 목록·관심사 재조회. 선택은 노출 교집합으로 자동 재구성된다
            if (error.errorCode === ERROR_CODES.INTEREST_TOPIC_UNAVAILABLE) {
              showToast(error.message);
              setIsRemovalConfirmed(false);
              void topicsQuery.refetch();
              void interestsQuery.refetch();
              return;
            }
          }
          // 타임아웃·5xx(자동 재시도 소진)·오프라인 — 인라인 에러, 편집 상태 유지(IM8)
          setSaveErrorMessage(INTEREST_COPY.saveFailed);
        },
      },
    );
  };

  const handleSavePress = () => {
    if (!canSave) return;
    // 해제가 포함된 저장에만 확인 팝업 — 저장당 1회다(interest-management.md 4.2)
    if (diff.removedIds.length > 0 && !isRemovalConfirmed) {
      setIsConfirmVisible(true);
      return;
    }
    executeSave();
  };

  const confirmRemovalAndSave = () => {
    setIsConfirmVisible(false);
    setIsRemovalConfirmed(true);
    executeSave();
  };

  const cancelRemovalConfirm = () => setIsConfirmVisible(false);

  /** IM8 [다시 시도] — 같은 저장의 반복이라 확인 팝업을 거치지 않는다(uiux 4.7) */
  const retrySave = () => executeSave();

  // beforeRemove 구독은 한 번만 하고 최신 상태는 ref로 읽는다 — 재구독 없이 가로챈다
  const hasChangesRef = useRef(hasChanges);
  const isSavingRef = useRef(isSaving);
  useEffect(() => {
    hasChangesRef.current = hasChanges;
    isSavingRef.current = isSaving;
  }, [hasChanges, isSaving]);

  // native-stack의 스와이프 백은 제스처가 네이티브에서 확정돼 beforeRemove로 막을 수 없다 —
  // 변경·저장 중에는 제스처 자체를 끈다(React Navigation 공식 가이드). 뒤로가기 버튼·Android
  // 하드웨어 백은 아래 beforeRemove가 가로채 이탈 팝업(IM7)을 띄운다.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !hasChanges && !isSaving });
  }, [navigation, hasChanges, isSaving]);

  useEffect(() => {
    // 변경이 있으면 뒤로가기(버튼·하드웨어 백)를 가로채 이탈 팝업을 띄운다(IM7). 변경이 없으면 그대로 나간다
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current || !hasChangesRef.current) return;
      event.preventDefault();
      // 저장 인플라이트 동안은 이탈 자체를 차단한다 — 팝업도 띄우지 않는다(uiux 4.3)
      if (isSavingRef.current) return;
      setPendingLeaveAction(event.data.action);
    });
    return unsubscribe;
  }, [navigation]);

  /** 앱바 뒤로가기 — 가로채기는 beforeRemove 한 곳에서 일관되게 처리된다 */
  const handleBackPress = () => navigation.goBack();

  const stayEditing = () => setPendingLeaveAction(null);

  /** [나가기] — 편집을 버리고 이전 화면으로. 서버 상태는 그대로다(위험색으로 그리지 않는다) */
  const leaveWithoutSaving = () => {
    const action = pendingLeaveAction;
    setPendingLeaveAction(null);
    allowLeaveRef.current = true;
    if (action) navigation.dispatch(action);
  };

  const refetchAll = () => {
    if (topicsQuery.isError) void topicsQuery.refetch();
    if (interestsQuery.isError) void interestsQuery.refetch();
  };

  return {
    topics,
    selectedCount,
    maxSelectable,
    changeCount: diff.changeCount,
    overLimitCount,
    isOverLimit,
    isBelowMin,
    hasChanges,
    canSave,
    isSaving,
    /** IM9 스켈레톤 — 0.3초 미만이면 표시하지 않는다 */
    showSkeleton: useDelayedVisible(isLoading),
    isLoading,
    isError,
    isRefetching: topicsQuery.isRefetching || interestsQuery.isRefetching,
    saveErrorMessage,
    isConfirmVisible,
    isLeaveConfirmVisible: pendingLeaveAction !== null,
    toggleTopic,
    handleSavePress,
    confirmRemovalAndSave,
    cancelRemovalConfirm,
    retrySave,
    handleBackPress,
    stayEditing,
    leaveWithoutSaving,
    refetchAll,
  };
};
