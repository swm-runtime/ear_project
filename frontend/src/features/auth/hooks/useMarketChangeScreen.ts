import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { logger } from '@/shared/lib/logger';
import { useToastStore } from '@/shared/ui/toast.store';

import { changeMarket, fetchMarketChangePreview, marketChangeKeys } from '../api/market-change.api';
import { CONTENT_LANGUAGE_MARKET, hasPolicyDocument, resolveMinAge } from '../auth.constants';
import { AUTH_COPY, ageConfirmationLabel } from '../auth.copy';
import type { ConsentType, ContentLanguage, MarketChangeBlockedReason } from '../auth.types';
import {
  getMarketChangeRevertTarget,
  markReonboardingAfterMarketChange,
} from '../services/market-change-state';
import { notifyMarketChanged } from '../services/market-changed-listener';
import { openPolicyDocument } from '../services/policy-document.service';
import { sessionService } from '../services/session.service';
import { selectMarket, useSessionStore } from '../store/session.store';

const SECONDS_PER_HOUR = 3600;

interface Blocked {
  reason: MarketChangeBlockedReason;
  retryAfterSec: number | null;
}

/**
 * 설정 › 콘텐츠 언어(시장) 전환(KAN-228 — global-api.md 4.11). 미리보기 → (막힘이면 안내) → 새 시장의 필수 동의 →
 * 전환 → **새 access token 으로 즉시 교체** → 세션 사용자가 온보딩 전으로 바뀌어 관문이 주제 단계로 보낸다.
 * 하루 1번·주제 초기화·라이브러리 숨김은 서버가 판정한다 — 화면은 알리기만 한다.
 *
 * 재온보딩 중 주제 화면의 [되돌리기]도 같은 화면이다(온보딩 스택에 등록 — 대상은 직전 시장).
 */
export const useMarketChangeScreen = (targetLanguage: ContentLanguage) => {
  const navigation = useNavigation();
  const currentMarket = useSessionStore(selectMarket);
  const targetMarket = CONTENT_LANGUAGE_MARKET[targetLanguage];
  const showToast = useToastStore((s) => s.show);

  const previewQuery = useQuery({
    queryKey: marketChangeKeys.preview(targetLanguage),
    queryFn: () => fetchMarketChangePreview(targetLanguage),
    // 막힘·동의 버전은 서버 판정이라 캐시로 먼저 그리지 않는다(탈퇴 미리보기와 같은 이유)
    staleTime: 0,
    gcTime: 0,
  });

  /** 기본값 전부 해제 — 동의는 사용자가 직접 체크한다(auth-uiux.md 8장 금지) */
  const [checkedMap, setCheckedMap] = useState<Partial<Record<ConsentType, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** 전환 요청이 막힘으로 돌아온 경우 — 미리보기 이후 상태가 바뀌었다(다른 기기에서 먼저 바꿈 등) */
  const [submitBlocked, setSubmitBlocked] = useState<Blocked | null>(null);

  const preview = previewQuery.data ?? null;
  const blocked: Blocked | null =
    submitBlocked ??
    (preview !== null && !preview.available && preview.blockedReason !== null
      ? { reason: preview.blockedReason, retryAfterSec: preview.retryAfterSec }
      : null);

  const items = (preview?.requiredConsents ?? []).map((consent) => ({
    ...consent,
    label:
      consent.consentType === 'age_confirmation'
        ? // 새 시장의 기준 연령 — 서버가 새 시장 + 계정 지역으로 판정해 `min_age` 로 준다
          ageConfirmationLabel(resolveMinAge(consent, targetMarket))
        : AUTH_COPY.consent.label[consent.consentType],
    description:
      consent.consentType === 'marketing' ? AUTH_COPY.consent.marketingDescription : null,
    isChecked: checkedMap[consent.consentType] ?? false,
  }));

  const isAllChecked = items.length > 0 && items.every((item) => item.isChecked);
  const canSubmit =
    preview !== null &&
    blocked === null &&
    !isSubmitting &&
    items.filter((item) => item.isRequired).every((item) => item.isChecked);

  const toggleConsent = (consentType: ConsentType) => {
    setCheckedMap((prev) => ({ ...prev, [consentType]: !(prev[consentType] ?? false) }));
  };

  const toggleAll = () => {
    const next = !isAllChecked;
    setCheckedMap(Object.fromEntries(items.map((item) => [item.consentType, next])));
  };

  /** [보기] — 새 시장의 문서다(GLOBAL → 영어 본문). 열람은 동의가 아니다 */
  const handleViewPress = (consentType: ConsentType) => {
    if (!hasPolicyDocument(consentType)) return;
    void openPolicyDocument(consentType, targetMarket);
  };

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const result = await changeMarket({
        language: targetLanguage,
        // 화면이 그린 항목 그대로 — version 은 미리보기 값 그대로(클라이언트 상수 금지)
        consents: items.map((item) => ({
          consentType: item.consentType,
          version: item.version,
          isAgreed: item.isChecked,
        })),
      });
      // 이미 그 시장 — 아무것도 바뀌지 않았다
      if (result.accessToken === null) {
        setIsSubmitting(false);
        goBack();
        return;
      }
      markReonboardingAfterMarketChange({
        previousMarket: currentMarket,
        isRevert: getMarketChangeRevertTarget() === targetMarket,
      });
      // 세션 사용자가 온보딩 전으로 바뀌면 관문이 스택을 통째로 바꾼다 — 이 화면은 그대로 내려간다
      await sessionService.switchMarket({ accessToken: result.accessToken, user: result.user });
      notifyMarketChanged(result.user.market);
    } catch (error) {
      setIsSubmitting(false);
      const code = isApiError(error) ? error.errorCode : null;
      if (code === ERROR_CODES.CONSENT_REQUIRED || code === ERROR_CODES.CONSENT_VERSION_STALE) {
        // 가입 재조회가 아니라 **미리보기를 다시 받아** 동의를 다시 그린다(global-api.md 4.11)
        setCheckedMap({});
        showToast(AUTH_COPY.marketChange.consentsChanged);
        void previewQuery.refetch();
        return;
      }
      if (code === ERROR_CODES.MARKET_UNAVAILABLE) {
        setSubmitBlocked({ reason: 'market_unavailable', retryAfterSec: null });
        return;
      }
      if (code === ERROR_CODES.MARKET_CHANGE_COOLDOWN) {
        setSubmitBlocked({
          reason: 'cooldown',
          retryAfterSec: isApiError(error) ? error.retryAfterSec : null,
        });
        return;
      }
      logger.error('[auth] market change failed', error);
      showToast(AUTH_COPY.marketChange.submitFailed);
    }
  };

  return {
    targetLanguageName: AUTH_COPY.marketChange.languageName[targetMarket],
    isLoading: previewQuery.isPending,
    isError: previewQuery.isError,
    isRefetching: previewQuery.isRefetching,
    retry: () => void previewQuery.refetch(),
    blocked,
    /** 쿨다운 남은 시간(시간 단위, 올림) — 다음 05:00 까지 */
    blockedHours:
      blocked?.retryAfterSec != null ? Math.ceil(blocked.retryAfterSec / SECONDS_PER_HOUR) : null,
    items,
    isAllChecked,
    canSubmit,
    isSubmitting,
    toggleConsent,
    toggleAll,
    handleViewPress,
    handleSubmit,
    goBack,
  };
};
