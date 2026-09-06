import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { generateId } from '@/shared/lib/generate-id';
import { logger } from '@/shared/lib/logger';
import { useToastStore } from '@/shared/ui/toast.store';

import { WITHDRAWAL_REASON_TEXT_MAX_LENGTH } from '../auth.constants';
import { AUTH_COPY } from '../auth.copy';
import type { WithdrawalReasonCode } from '../auth.types';
import { useWithdrawalPreviewQuery } from './useWithdrawalPreviewQuery';
import { useWithdrawMutation } from './useWithdrawMutation';
import { sessionService } from '../services/session.service';

/** 서버가 되돌려준 판정 실패를 어느 체크로 안내할지 — 강조 대상(common-error-handling.md 9.3) */
type HighlightedCheck = 'confirm' | 'subscriptionExpiry';

/**
 * A7 탈퇴 안내 · A8 처리 중의 로직 소유자 — 화면은 뷰만 담당한다(auth.md 4.3).
 *
 * **구성 분기는 전부 서버 응답(`withdrawal-preview`)이 소유한다.** 로컬 구독 상태
 * (`user.tier`)로 결제 이력을 추측하지 않는다 — 결제 후 만료돼 무료로 돌아온 사용자를
 * "결제 이력 없음"으로 잘못 안내하게 된다(auth-api.md 4.6).
 */
export const useWithdrawalScreen = () => {
  // setOptions(gestureEnabled)를 쓰기 위한 native-stack 타이핑 — 파람 목록은 app 소유라 모른다
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const showToast = useToastStore((s) => s.show);
  const previewQuery = useWithdrawalPreviewQuery();
  const withdrawMutation = useWithdrawMutation();

  const [reasonCode, setReasonCode] = useState<WithdrawalReasonCode | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [isSubscriptionExpiryAgreed, setIsSubscriptionExpiryAgreed] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [highlightedCheck, setHighlightedCheck] = useState<HighlightedCheck | null>(null);
  /** 데이터 정합성 실패(WITHDRAWAL_ARCHIVE_IDENTITY_MISSING) — 탈퇴 미진행 안내 화면으로 전환한다 */
  const [isArchiveIdentityMissing, setIsArchiveIdentityMissing] = useState(false);
  /**
   * 204를 받은 뒤 세션 정리(비동기)로 스택이 교체되기까지의 구간.
   * 이걸 두지 않으면 요청이 끝난 프레임에 A8이 걷히고 안내 화면(A7)이 잠깐 되살아난다 —
   * 이미 사라진 계정의 탈퇴 버튼을 다시 보여주는 셈이 된다.
   */
  const [isFinishing, setIsFinishing] = useState(false);

  /**
   * 멱등키 — **한 번의 탈퇴 시도 단위로 발급하고 [다시 시도]에서 재사용한다**
   * (onboarding-completion.service와 같은 관례). 통신 실패의 재시도가 두 번째 탈퇴 요청이
   * 되면 안 되기 때문이다. 반대로 사용자가 입력을 고쳐 다시 보내는 경우(체크 누락 400)는
   * 본문이 달라지므로 키를 버리고 새로 발급한다.
   */
  const idempotencyKeyRef = useRef<string | null>(null);

  const preview = previewQuery.data ?? null;
  /** A8 구간 — 요청 인플라이트부터 스택 교체 직전까지. 이 동안 이탈이 차단된다 */
  const isSubmitting = withdrawMutation.isPending || isFinishing;

  /** 활성 구독이 있으면 만료 동의 없이는 [탈퇴하기]를 활성화하지 않는다(auth.md 4.3-2) */
  const isExpiryAgreementRequired = preview?.subscriptionExpiryAgreementRequired ?? false;
  const canSubmit =
    preview !== null &&
    isConfirmed &&
    (!isExpiryAgreementRequired || isSubscriptionExpiryAgreed) &&
    !isSubmitting;

  /* ── 입력 ── */

  /** 편집을 이어가면 직전 실패 안내를 지운다 — "다시 시도"가 가리키던 요청이 더는 없다 */
  const beginEdit = (): void => {
    setSubmitError(null);
    setHighlightedCheck(null);
  };

  /** 사유는 선택이다. 선택된 항목을 다시 탭하면 해제된다(커리어 칩과 같은 문법) */
  const toggleReason = (code: WithdrawalReasonCode): void => {
    if (isSubmitting) return;
    beginEdit();
    setReasonCode((current) => (current === code ? null : code));
  };

  const changeReasonText = (text: string): void => {
    if (isSubmitting) return;
    beginEdit();
    setReasonText(text);
  };

  const toggleSubscriptionExpiryAgreement = (): void => {
    if (isSubmitting) return;
    beginEdit();
    setIsSubscriptionExpiryAgreed((current) => !current);
  };

  const toggleConfirm = (): void => {
    if (isSubmitting) return;
    beginEdit();
    setIsConfirmed((current) => !current);
  };

  /* ── 제출(A8) ── */

  const executeWithdraw = (): void => {
    if (isSubmitting || preview === null) return;
    setSubmitError(null);
    setHighlightedCheck(null);
    idempotencyKeyRef.current ??= generateId();

    withdrawMutation.mutate(
      {
        submission: {
          reasonCode,
          // 빈 문자열은 값이 아니다 — 키 자체를 싣지 않는다
          reasonText: reasonText.trim() === '' ? null : reasonText.trim(),
          confirm: isConfirmed,
          // 활성 구독이 없으면 서버가 요구하지 않는 필드다(auth-api.md 4.7)
          agreedSubscriptionExpiry: isExpiryAgreementRequired ? isSubscriptionExpiryAgreed : null,
        },
        idempotencyKey: idempotencyKeyRef.current,
      },
      {
        onSuccess: () => {
          idempotencyKeyRef.current = null;
          setIsFinishing(true);
          // 완료 토스트 → 시작 화면으로 **스택 초기화**(auth-uiux.md 4.6).
          // 세션 정리는 기존 로그아웃 경로가 쓰는 SessionService.clearSession을 그대로 쓴다 —
          // 계정이 이미 사라졌으므로 POST /auth/logout(세션 폐기)은 부르지 않는다.
          // 상태 전환만으로 RootNavigator가 스택을 통째로 교체한다(architecture.md 6.3)
          showToast(AUTH_COPY.withdrawal.successToast);
          void sessionService.clearSession().catch((error) => {
            logger.error('[withdrawal] failed to clear session', error);
          });
        },
        onError: (error) => {
          if (isApiError(error)) {
            // 확인 체크 누락 — 입력을 고쳐 다시 보내는 경로라 멱등키를 버린다
            if (error.errorCode === ERROR_CODES.WITHDRAWAL_CONFIRM_REQUIRED) {
              idempotencyKeyRef.current = null;
              setIsConfirmed(false);
              setHighlightedCheck('confirm');
              setSubmitError(error.message);
              return;
            }
            // 만료 동의 누락 — 화면 체류 중 구독이 활성으로 바뀌었을 수 있으므로 안내를
            // 서버 판정으로 다시 맞춘다(체크가 없던 화면에 체크가 나타난다)
            if (error.errorCode === ERROR_CODES.WITHDRAWAL_SUBSCRIPTION_EXPIRY_NOT_AGREED) {
              idempotencyKeyRef.current = null;
              setIsSubscriptionExpiryAgreed(false);
              setHighlightedCheck('subscriptionExpiry');
              setSubmitError(error.message);
              void previewQuery.refetch();
              return;
            }
            // 결제 이력이 있는데 이메일이 없다 — 서버가 탈퇴를 진행하지 않았다.
            // 재시도가 의미 없는 데이터 정합성 문제이므로 전체 화면으로 알린다
            if (error.errorCode === ERROR_CODES.WITHDRAWAL_ARCHIVE_IDENTITY_MISSING) {
              idempotencyKeyRef.current = null;
              setIsArchiveIdentityMissing(true);
              return;
            }
          }
          // 타임아웃·5xx·오프라인 — 인라인 에러 + [다시 시도]. 같은 멱등키를 유지해
          // 재시도가 두 번째 탈퇴 요청이 되지 않게 한다(common-error-handling.md 4.2)
          logger.warn('[withdrawal] withdraw failed', error);
          setSubmitError(isApiError(error) ? error.message : AUTH_COPY.withdrawal.failed);
        },
      },
    );
  };

  const handleSubmitPress = (): void => {
    if (!canSubmit) return;
    executeWithdraw();
  };

  /* ── 이탈 차단 — A8 동안은 취소·뒤로가기를 막는다(auth-uiux.md 4.6) ── */

  const isSubmittingRef = useRef(isSubmitting);
  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  // native-stack의 스와이프 백은 네이티브에서 확정돼 beforeRemove로 막을 수 없다 —
  // 처리 중에는 제스처 자체를 끈다(커리어 화면과 같은 처리)
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !isSubmitting });
  }, [navigation, isSubmitting]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      // 서버가 이관과 파기를 하나의 트랜잭션으로 수행하는 구간이다 — 결과를 확인할
      // 화면이 사라지면 안 된다. 성공 후의 이탈은 스택 교체(RootNavigator)라 여기 오지 않는다
      if (isSubmittingRef.current) event.preventDefault();
    });
    return unsubscribe;
  }, [navigation]);

  const goBack = (): void => {
    if (isSubmitting) return;
    navigation.goBack();
  };

  const retryLoad = (): void => {
    if (previewQuery.isFetching) return; // 연타는 인플라이트 요청이 있으면 무시한다
    void previewQuery.refetch();
  };

  return {
    /** null이면 아직 조회 전이다 — 화면은 스켈레톤을 그린다 */
    preview,
    isLoading: previewQuery.isPending,
    /** 스켈레톤은 0.3초 미만이면 표시하지 않는다(common-error-handling.md 5장) */
    showSkeleton: useDelayedVisible(previewQuery.isPending),
    isLoadError: previewQuery.isError,
    isRetryingLoad: previewQuery.isFetching,
    retryLoad,

    reasonCode,
    reasonText,
    reasonTextMaxLength: WITHDRAWAL_REASON_TEXT_MAX_LENGTH,
    toggleReason,
    changeReasonText,

    isSubscriptionExpiryAgreed,
    toggleSubscriptionExpiryAgreement,
    isConfirmed,
    toggleConfirm,
    highlightedCheck,

    canSubmit,
    /** A8 — 전체 화면 로딩. 취소·뒤로가기가 차단된 구간이다 */
    isSubmitting,
    submitError,
    isArchiveIdentityMissing,
    handleSubmitPress,
    goBack,
  };
};
