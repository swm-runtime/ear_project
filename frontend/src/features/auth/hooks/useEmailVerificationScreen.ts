import { useNavigation, useRoute, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { generateId } from '@/shared/lib/generate-id';
import { useToastStore } from '@/shared/ui/toast.store';

import { emailVerificationKeys, invalidateEmailVerification } from '../api/email-verification.api';
import { EMAIL_CODE_LENGTH } from '../auth.constants';
import { AUTH_COPY } from '../auth.copy';
import type { ActiveEmailVerification } from '../auth.types';
import { useActiveEmailVerificationQuery } from './useActiveEmailVerificationQuery';
import { useSendEmailVerificationMutation } from './useSendEmailVerificationMutation';
import { useVerifyEmailCodeMutation } from './useVerifyEmailCodeMutation';
import {
  formatCountdown,
  isEmailFormatValid,
  lockRemainingMinutes,
  remainingSeconds,
} from '../services/email-verification';

const EMAIL_COPY = AUTH_COPY.email;

/** 낭독기에 남은 시간을 알리는 임계 시점(auth-uiux.md 7장 — 매초 읽지 않는다) */
const COUNTDOWN_ANNOUNCE_THRESHOLDS = [30, 10];

/** 코드 입력 단계의 상태 — 만료·소진은 입력을 닫고 [재전송]만 남긴다(auth-uiux.md 4.12·4.13) */
type CodeStage = 'active' | 'expired' | 'exhausted';

/**
 * 이메일 인증 화면(A10 → A13 → A18)의 로직 소유자 — 화면은 뷰만 담당한다.
 * 설정·프로필 경로 전용이다. 결제 경로(A9·A19)는 결제 기능 구현 시 진입 사유 문구와
 * 복귀 지점만 다르게 얹는다(auth-api.md 6장 — API는 갈라지지 않는다).
 *
 * 만료·쿨다운·잠금의 최종 판정은 전부 서버다(auth.md 4.5). 여기 있는 카운트다운은
 * 서버가 준 시각(expires_at·resend_available_at)을 초 단위로 다시 계산하는 표시용이다.
 */
export const useEmailVerificationScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const route = useRoute();
  // 파람 목록은 app 소유라 여기서는 모른다 — 진입 화면(설정·프로필)이 현재 이메일을 실어 보낸다
  const { currentEmail = null } = (route.params ?? {}) as { currentEmail?: string | null };

  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const activeQuery = useActiveEmailVerificationQuery();
  const sendMutation = useSendEmailVerificationMutation();
  const verifyMutation = useVerifyEmailCodeMutation();

  const [step, setStep] = useState<'input' | 'code'>('input');
  const [emailInput, setEmailInput] = useState('');
  /** A11 인라인 — null이 아니면 [인증 코드 받기]를 비활성으로 둔다(입력을 고치면 풀린다) */
  const [inputError, setInputError] = useState<string | null>(null);
  /** 화면이 들고 있는 진행 중 인증 건 — 발송 응답 또는 재진입 조회(4.9)로 채워진다 */
  const [verification, setVerification] = useState<ActiveEmailVerification | null>(null);
  const [codeValue, setCodeValue] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  /** 서버가 판정한 만료·소진 — 타이머 만료는 파생값으로 따로 계산한다 */
  const [serverCodeStage, setServerCodeStage] = useState<CodeStage>('active');
  /** 그 주소의 발송 잠금 해제 시각(ms) — SEND_LIMIT 응답의 retry_after_sec으로 환산 */
  const [lockedUntilMs, setLockedUntilMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const announcedRef = useRef<Set<number>>(new Set());

  /* ── 재진입 하이드레이션 — 진행 중 건이 있으면 코드 입력을 이어서 한다(auth-api.md 4.9) ── */
  const [hasHydrated, setHasHydrated] = useState(false);
  if (!hasHydrated && activeQuery.isSuccess) {
    // effect의 동기 setState를 피한다 — 렌더 중 전환(career 하이드레이션과 같은 방식)
    setHasHydrated(true);
    if (activeQuery.data !== null) {
      setVerification(activeQuery.data);
      setStep('code');
      if (activeQuery.data.sendLockedUntil !== null) {
        setLockedUntilMs(Date.parse(activeQuery.data.sendLockedUntil));
      }
    }
  }

  /* ── 표시용 시계 — 코드 단계에서만 1초 간격으로 돈다 ── */
  const isTicking = step === 'code' && verification !== null;
  useEffect(() => {
    if (!isTicking) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isTicking]);

  const codeRemainingSec =
    verification === null ? 0 : remainingSeconds(verification.expiresAt, nowMs);
  const resendCooldownSec =
    verification === null ? 0 : remainingSeconds(verification.resendAvailableAt, nowMs);
  const lockRemainingSec =
    lockedUntilMs === null ? 0 : Math.max(0, Math.ceil((lockedUntilMs - nowMs) / 1000));

  /** 서버 판정이 우선, 그다음 표시용 타이머의 00:00(auth-uiux.md 4.12) */
  const codeStage: CodeStage =
    serverCodeStage !== 'active' ? serverCodeStage : codeRemainingSec === 0 ? 'expired' : 'active';

  /* 카운트다운 낭독 — 임계 시점에만 알린다(auth-uiux.md 7장) */
  useEffect(() => {
    if (step !== 'code' || codeStage !== 'active') return;
    if (
      COUNTDOWN_ANNOUNCE_THRESHOLDS.includes(codeRemainingSec) &&
      !announcedRef.current.has(codeRemainingSec)
    ) {
      announcedRef.current.add(codeRemainingSec);
      AccessibilityInfo.announceForAccessibility(EMAIL_COPY.countdownA11y(codeRemainingSec));
    }
  }, [codeRemainingSec, codeStage, step]);

  /* ── 발송 — [인증 코드 받기]와 [재전송]이 같은 엔드포인트를 쓴다(auth-api.md 4.8) ── */

  const startSend = (email: string, origin: 'input' | 'resend'): void => {
    if (sendMutation.isPending) return;
    sendMutation.mutate(
      { email, idempotencyKey: generateId() },
      {
        onSuccess: (result) => {
          setVerification(result);
          setStep('code');
          setCodeValue('');
          setCodeError(null);
          setServerCodeStage('active');
          setLockedUntilMs(null);
          setInputError(null);
          announcedRef.current.clear();
          setNowMs(Date.now());
        },
        onError: (error) => {
          if (!isApiError(error)) {
            showToast(EMAIL_COPY.sendFailedToast);
            return;
          }
          switch (error.errorCode) {
            case ERROR_CODES.EMAIL_FORMAT_INVALID:
              setInputError(EMAIL_COPY.formatInvalid);
              break;
            case ERROR_CODES.EMAIL_ALREADY_REGISTERED:
              // 인증까지 끝난 같은 주소 — 횟수는 소모되지 않았다(auth-uiux.md 4.8)
              setInputError(EMAIL_COPY.alreadyRegistered);
              break;
            case ERROR_CODES.EMAIL_VERIFICATION_SEND_LIMIT: {
              // 잠금은 그 주소에만 걸린다 — 분 단위 안내 + [메일 다시 입력]은 살린다(4.14)
              const retryAfterSec = error.retryAfterSec ?? 3600;
              if (origin === 'input') {
                setInputError(EMAIL_COPY.sendLimit(lockRemainingMinutes(retryAfterSec)));
              } else {
                setLockedUntilMs(Date.now() + retryAfterSec * 1000);
              }
              break;
            }
            case ERROR_CODES.EMAIL_VERIFICATION_RESEND_COOLDOWN:
              // 서버 판정의 쿨다운을 표시에 반영한다 — 클라이언트 타이머와 어긋난 경우다
              if (verification !== null && error.retryAfterSec !== null) {
                setVerification({
                  ...verification,
                  resendAvailableAt: new Date(
                    Date.now() + error.retryAfterSec * 1000,
                  ).toISOString(),
                });
              }
              break;
            default:
              // EMAIL_SEND_FAILED(횟수 미차감)·네트워크 — 재시도 액션을 얹는다(auth-uiux.md 4.9)
              showToast(EMAIL_COPY.sendFailedToast, {
                label: EMAIL_COPY.retry,
                onPress: () => startSend(email, origin),
              });
          }
        },
      },
    );
  };

  /* ── 검증 — 6칸이 채워지면 자동 요청, 별도 [확인] 버튼이 없다(auth-uiux.md 4.10) ── */

  const startVerify = (code: string): void => {
    if (verification === null || verifyMutation.isPending) return;
    verifyMutation.mutate(
      { verificationId: verification.verificationId, code },
      {
        onSuccess: () => {
          // 설정·프로필 경로 — 직전 화면 복귀 + 토스트(auth-uiux.md 4.15). 값 갱신은
          // bootstrap이 주입한 리스너의 invalidate가 수행한다
          showToast(EMAIL_COPY.successToast);
          navigation.goBack();
        },
        onError: (error) => {
          if (!isApiError(error)) {
            setCodeError(EMAIL_COPY.verifyFailed);
            return;
          }
          switch (error.errorCode) {
            case ERROR_CODES.EMAIL_VERIFICATION_CODE_MISMATCH:
              // 입력값은 지우지 않는다(4.11). 남은 시도는 서버 값이다 — 4.9를 다시 읽어 얻는다
              setCodeError(EMAIL_COPY.codeMismatch(null));
              void activeQuery.refetch().then((fresh) => {
                const remaining = fresh.data?.attemptsRemaining;
                if (remaining !== undefined && remaining !== null) {
                  setCodeError(EMAIL_COPY.codeMismatch(remaining));
                }
              });
              break;
            case ERROR_CODES.EMAIL_VERIFICATION_CODE_EXPIRED:
              setServerCodeStage('expired');
              break;
            case ERROR_CODES.EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED:
              setServerCodeStage('exhausted');
              break;
            case ERROR_CODES.EMAIL_VERIFICATION_NOT_FOUND:
              // 재발송·무효화로 사라진 건 — 입력 화면으로 되돌린다(auth-api.md 5장)
              returnToInput(verification.email);
              break;
            default:
              setCodeError(EMAIL_COPY.verifyFailed);
          }
        },
      },
    );
  };

  /* ── 화면 액션 ── */

  const changeEmailInput = (text: string): void => {
    setEmailInput(text);
    setInputError(null);
  };

  /** 형식 검증은 입력 중이 아니라 포커스 아웃·버튼 탭 시점이다(auth-uiux.md 4.8) */
  const validateEmailInput = (): void => {
    if (emailInput.trim() !== '' && !isEmailFormatValid(emailInput)) {
      setInputError(EMAIL_COPY.formatInvalid);
    }
  };

  const submitEmail = (): void => {
    const trimmed = emailInput.trim();
    if (!isEmailFormatValid(trimmed)) {
      // 형식이 맞지 않으면 발송 요청 자체를 보내지 않는다(auth-uiux.md 4.8)
      setInputError(EMAIL_COPY.formatInvalid);
      return;
    }
    startSend(trimmed, 'input');
  };

  const changeCode = (value: string): void => {
    setCodeValue(value);
    setCodeError(null);
    if (value.length === EMAIL_CODE_LENGTH) {
      startVerify(value);
    }
  };

  const resend = (): void => {
    if (verification === null) return;
    startSend(verification.email, 'resend');
  };

  const returnToInput = (prefillEmail: string): void => {
    setStep('input');
    setEmailInput(prefillEmail);
    setInputError(null);
    setVerification(null);
    setCodeValue('');
    setCodeError(null);
    setServerCodeStage('active');
    setLockedUntilMs(null);
    queryClient.setQueryData(emailVerificationKeys.active(), null);
  };

  /**
   * [메일 다시 입력](auth-uiux.md 4.10) — 직전 주소를 채운 입력 화면으로 되돌리고
   * 진행 중 건을 무효화한다. 무효화 실패는 무시한다 — 코드는 3분 뒤 만료되고
   * 다음 발송이 어차피 무효화한다(auth-api.md 4.11).
   */
  const reenterEmail = (): void => {
    const current = verification;
    returnToInput(current?.email ?? emailInput);
    if (current !== null) {
      void invalidateEmailVerification(current.verificationId).catch(() => undefined);
    }
  };

  const isSendLocked = lockRemainingSec > 0;

  return {
    step,
    goBack: () => navigation.goBack(),

    /* 진입 조회(4.9) — 하이드레이션 전 실패만 전체 화면 에러다 */
    showSkeleton: useDelayedVisible(!hasHydrated && activeQuery.isPending),
    loadFailed: !hasHydrated && activeQuery.isError,
    isRetryingLoad: activeQuery.isRefetching,
    retryLoad: () => void activeQuery.refetch(),

    /* A10 입력 단계 */
    currentEmail,
    emailInput,
    inputError,
    changeEmailInput,
    validateEmailInput,
    submitEmail,
    isSending: sendMutation.isPending,
    canSend: !sendMutation.isPending && emailInput.trim() !== '' && inputError === null,

    /* A13 코드 단계 */
    sentEmail: verification?.email ?? '',
    codeValue,
    changeCode,
    codeError,
    codeStage,
    codeNotice:
      codeStage === 'expired'
        ? EMAIL_COPY.codeExpired
        : codeStage === 'exhausted'
          ? EMAIL_COPY.attemptsExceeded
          : null,
    isCodeEditable: codeStage === 'active' && !verifyMutation.isPending,
    isVerifying: verifyMutation.isPending,
    countdownLabel: formatCountdown(codeRemainingSec),
    isCountdownWarning: codeRemainingSec > 0 && codeRemainingSec <= 30,
    /** 잠금 중에도 유효한 코드 입력은 살아 있다 — 잠기는 것은 발송이지 검증이 아니다(4.14) */
    lockNotice: isSendLocked
      ? EMAIL_COPY.sendLimit(lockRemainingMinutes(lockRemainingSec))
      : null,
    resendLabel:
      resendCooldownSec > 0 ? EMAIL_COPY.resendCooldown(resendCooldownSec) : EMAIL_COPY.resend,
    canResend: !sendMutation.isPending && resendCooldownSec === 0 && !isSendLocked,
    reenterEmail,
    resend,
  };
};
