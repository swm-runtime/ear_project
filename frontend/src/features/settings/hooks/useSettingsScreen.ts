import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Linking } from 'react-native';

import { copyToClipboard } from '@/shared/lib/clipboard';
import { logger } from '@/shared/lib/logger';
import { useToastStore } from '@/shared/ui/toast.store';

import { sessionService } from '@/features/auth';
import { getOsPermissionStatus, type OsPermissionStatus } from '@/features/notification';

import { settingsKeys, submitMarketingConsent, updateUserSettings } from '../api/settings.api';
import { KAKAO_CHANNEL_URL, PRIVACY_POLICY_URL, STORE_URL, TERMS_URL } from '../settings.constants';
import { SETTINGS_COPY } from '../settings.copy';
import { deriveEmailStatus } from '../settings.format';
import type {
  EmailStatus,
  PlaybackRate,
  SettingsPlan,
  SettingsSummary,
  SettingsToggleField,
} from '../settings.types';
import { useSettingsQuery } from './useSettingsQuery';

/** 카드 영역의 3상 — null(로딩 중)은 스켈레톤이 덮으므로 상태에 넣지 않는다(profile과 동일) */
export type SectionState<T> = { kind: 'data'; data: T } | { kind: 'error' };

/** 구독 요약 VM — 서버가 정규화한 status 4분기를 그대로 실어 나른다(settings-api.md 4.1) */
export type PlanRowVM =
  | { kind: 'free'; dailyPlayLimit: number | null }
  | { kind: 'subscribed'; planName: string; renewsAt: string | null }
  | { kind: 'cancelScheduled'; planName: string; expiresAt: string | null }
  | { kind: 'grace'; planName: string };

export interface EmailRowVM {
  status: EmailStatus;
  email: string | null;
}

/** 토글·배속의 표시 값 — 조회 전·전체 실패에는 null(기준값 없는 낙관적 UI는 성립하지 않는다) */
export interface SettingsControlsVM {
  playbackRate: PlaybackRate;
  isDripNotificationEnabled: boolean;
  isMarketingAgreed: boolean;
}

const toPlanRowVM = (plan: SettingsPlan): PlanRowVM => {
  switch (plan.status) {
    case 'free':
      return { kind: 'free', dailyPlayLimit: plan.dailyPlayLimit };
    case 'subscribed':
      return { kind: 'subscribed', planName: plan.planName, renewsAt: plan.renewsAt };
    case 'cancel_scheduled':
      return { kind: 'cancelScheduled', planName: plan.planName, expiresAt: plan.expiresAt };
    case 'grace':
      return { kind: 'grace', planName: plan.planName };
  }
};

/** 메뉴 항목의 목적지 — 전부 MainStack 위에 얹히는 화면들이다(일부는 아직 placeholder) */
type SettingsDestination =
  | 'Subscription'
  | 'EmailVerification'
  | 'InterestManagement'
  | 'Career'
  | 'Notice'
  | 'Withdrawal'
  | 'Admin';

/** 낙관적 표시값 덮개 — 저장 성공 시 캐시로 확정되고, 실패 시 걷어내면 서버 값으로 되돌아간다 */
interface OptimisticOverlay {
  defaultPlaybackRate?: PlaybackRate;
  isDripNotificationEnabled?: boolean;
  isMarketingAgreed?: boolean;
}

export const useSettingsScreen = () => {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const query = useSettingsQuery();
  const showToast = useToastStore((s) => s.show);

  /* ── OS 알림 권한 — 판정 입력은 기기만 안다. 서버 필드가 없다(settings-api.md 3장 설계 메모) ── */

  const [osPermission, setOsPermission] = useState<OsPermissionStatus | null>(null);

  const refreshOsPermission = useCallback((): void => {
    getOsPermissionStatus()
      .then(setOsPermission)
      .catch((error) => logger.warn('[settings] failed to read OS permission', error));
  }, []);

  // 진입·하위 화면 복귀마다 재확인한다. 포그라운드 복귀 재확인은 아래 AppState 구독이 담당한다
  useFocusEffect(refreshOsPermission);

  // OS 설정에서 권한을 바꾸고 돌아온 경우 토글 톤·배너 노출을 갱신한다(settings.md 7장).
  // TODO(notification 본개발): 서버 동기화(PUT devices)는 AppLifecycleService가 이어받는다(architecture.md 5.5)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshOsPermission();
    });
    return () => subscription.remove();
  }, [refreshOsPermission]);

  /* ── 조회 — 하위 화면 복귀 focus마다 조용히 재조회한다(이메일 인증·구독 변경 흡수) ── */

  useFocusEffect(
    useCallback(() => {
      // 첫 진입의 조회는 useQuery 마운트가 담당한다 — 중복 조회를 만들지 않는다
      if (queryClient.getQueryData(settingsKeys.summary()) === undefined) return;
      void queryClient.invalidateQueries({ queryKey: settingsKeys.summary() });
    }, [queryClient]),
  );

  const summary = query.data;
  const isFullError = query.isError;

  /* ── 낙관적 토글(settings.md 4.2 · settings-api.md 4.2) ──
   * client_seq는 조작마다 단조 증가시키고, 필드별 마지막 순번보다 오래된 응답·실패는 무시한다 —
   * 연타에서 마지막 조작이 최종이 된다(settings.md 7장). */

  const clientSeqRef = useRef(0);
  const lastSeqByFieldRef = useRef<Partial<Record<SettingsToggleField, number>>>({});
  const [overlay, setOverlay] = useState<OptimisticOverlay>({});

  const clearOverlay = (key: keyof OptimisticOverlay): void => {
    setOverlay((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  /** 실패 원복 — 조용히 되돌리지 않는다(settings-uiux.md 4.5, 시각 원복은 스크린리더에 전달되지 않는다) */
  const rollbackWithNotice = (key: keyof OptimisticOverlay): void => {
    clearOverlay(key);
    showToast(SETTINGS_COPY.saveError);
    AccessibilityInfo.announceForAccessibility(SETTINGS_COPY.saveError);
  };

  const updateSettingsMutation = useMutation({ mutationFn: updateUserSettings });
  const marketingConsentMutation = useMutation({ mutationFn: submitMarketingConsent });

  const saveSettingsField = (
    field: Exclude<SettingsToggleField, 'marketing_consent'>,
    overlayKey: keyof OptimisticOverlay,
    value: PlaybackRate | boolean,
  ): void => {
    const clientSeq = ++clientSeqRef.current;
    lastSeqByFieldRef.current[field] = clientSeq;
    setOverlay((prev) => ({ ...prev, [overlayKey]: value }));

    updateSettingsMutation.mutate(
      { patch: { [field]: value }, clientSeq },
      {
        onSuccess: (result) => {
          if (lastSeqByFieldRef.current[field] !== result.clientSeq) return; // 오래된 응답 무시
          // 갱신 후의 설정 전체로 화면 값을 확정한다(settings-api.md 4.2)
          queryClient.setQueryData<SettingsSummary>(settingsKeys.summary(), (prev) =>
            prev ? { ...prev, settings: result.settings } : prev,
          );
          clearOverlay(overlayKey);
        },
        onError: (error, variables) => {
          if (lastSeqByFieldRef.current[field] !== variables.clientSeq) return;
          logger.warn('[settings] save failed', error);
          // TODO(OfflineQueue — architecture.md 5.4): 오프라인은 실패가 아니라 지연이다.
          // 큐 도입 시 NETWORK_ERROR는 원복 없이 적재로 전환한다(settings-uiux.md 4.5)
          rollbackWithNotice(overlayKey);
        },
      },
    );
  };

  /* ── 이어 PICK 알림 토글 — OS 권한 게이트는 클라이언트가 서버 호출 없이 막는다(settings.md 4.3) ── */

  const [isPermissionDialogVisible, setIsPermissionDialogVisible] = useState(false);
  const [isPrePromptVisible, setIsPrePromptVisible] = useState(false);

  const toggleDripNotification = (next: boolean): void => {
    if (next && osPermission !== 'granted') {
      // 미결정이면 사전 안내를 경유한다 — OS 다이얼로그를 바로 띄우지 않는다(settings-uiux.md 8장)
      if (osPermission === 'undetermined') {
        setIsPrePromptVisible(true);
      } else {
        setIsPermissionDialogVisible(true);
      }
      return; // 토글은 켜지 않고, 서버 호출도 없다(settings-api.md 3장)
    }
    saveSettingsField('is_drip_notification_enabled', 'isDripNotificationEnabled', next);
  };

  /** S4 [설정 열기] — 복귀 시 권한을 재확인하지만 토글을 자동으로 켜지 않는다(settings-uiux.md 4.3) */
  const openOsSettings = (): void => {
    setIsPermissionDialogVisible(false);
    void Linking.openSettings().catch((error) =>
      logger.warn('[settings] failed to open OS settings', error),
    );
  };

  /** 사전 안내 종료 — 배너·토글 표시를 최신 권한으로 갱신한다(자동 켜기 없음) */
  const finishPrePrompt = (): void => {
    setIsPrePromptVisible(false);
    refreshOsPermission();
  };

  /* ── 마케팅 수신 동의 토글 — 같은 낙관적 규칙 + consents 이력 기록(settings-uiux.md 4.5) ── */

  const toggleMarketingConsent = (next: boolean): void => {
    const clientSeq = ++clientSeqRef.current;
    lastSeqByFieldRef.current.marketing_consent = clientSeq;
    setOverlay((prev) => ({ ...prev, isMarketingAgreed: next }));

    marketingConsentMutation.mutate(
      { isAgreed: next, clientSeq },
      {
        onSuccess: (result) => {
          if (lastSeqByFieldRef.current.marketing_consent !== result.clientSeq) return;
          queryClient.setQueryData<SettingsSummary>(settingsKeys.summary(), (prev) =>
            prev ? { ...prev, marketingConsent: result.marketingConsent } : prev,
          );
          clearOverlay('isMarketingAgreed');
        },
        onError: (error, variables) => {
          if (lastSeqByFieldRef.current.marketing_consent !== variables.clientSeq) return;
          // 법적 이력이라 실패를 조용히 삼키지 않는 것이 특히 중요하다(settings-uiux.md 4.5)
          logger.warn('[settings] marketing consent save failed', error);
          rollbackWithNotice('isMarketingAgreed');
        },
      },
    );
  };

  /* ── 기본 배속 시트 — 선택 즉시 저장하고 닫는다. [저장] 버튼을 두지 않는다(settings.md 4.2) ── */

  const [isRateSheetVisible, setIsRateSheetVisible] = useState(false);

  const selectPlaybackRate = (rate: PlaybackRate): void => {
    setIsRateSheetVisible(false);
    saveSettingsField('default_playback_rate', 'defaultPlaybackRate', rate);
  };

  /* ── 로그아웃(S5) — 서버 폐기 실패해도 진행한다(auth.md 4.2, sessionService 소관) ── */

  const [isLogoutDialogVisible, setIsLogoutDialogVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const confirmLogout = (): void => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    // 성공하면 세션 상태 전환으로 RootNavigator가 시작 화면으로 스택을 통째로 교체한다(architecture.md 6.3)
    sessionService.logout().catch((error) => {
      logger.error('[settings] logout failed', error);
      setIsLoggingOut(false);
      setIsLogoutDialogVisible(false);
    });
  };

  /* ── 외부 목적지 — 문의(카카오톡 채널)·약관·스토어. 전부 서버 호출 없는 클라이언트 동작이다 ── */

  const [isContactFallbackVisible, setIsContactFallbackVisible] = useState(false);

  const openContact = (): void => {
    // 열 수 없으면(미설치·열기 실패) 링크 복사 다이얼로그로 폴백한다(settings.md 7장)
    Linking.openURL(KAKAO_CHANNEL_URL).catch(() => setIsContactFallbackVisible(true));
  };

  const copyContactLink = (): void => {
    copyToClipboard(KAKAO_CHANNEL_URL)
      .then(() => {
        setIsContactFallbackVisible(false);
        showToast(SETTINGS_COPY.support.copied);
      })
      .catch((error) => logger.warn('[settings] clipboard copy failed', error));
  };

  // TODO: expo-web-browser 도입 시 인앱 브라우저로 교체한다(settings.md 4.1 — 약관은 인앱 브라우저)
  const openTerms = (): void => {
    Linking.openURL(TERMS_URL).catch((error) => logger.warn('[settings] open terms failed', error));
  };
  const openPrivacyPolicy = (): void => {
    Linking.openURL(PRIVACY_POLICY_URL).catch((error) =>
      logger.warn('[settings] open privacy failed', error),
    );
  };
  const openStore = (): void => {
    Linking.openURL(STORE_URL).catch((error) => logger.warn('[settings] open store failed', error));
  };

  /* ── 내비게이션 ── */

  const openDestination = (destination: SettingsDestination): void => {
    navigation.navigate('Main', { screen: destination });
  };

  /* ── 섹션별 VM — 부분 실패는 해당 카드만 에러로 둔다(S6) ── */

  const hasFailed = (section: 'account' | 'plan' | 'interest_summary'): boolean =>
    summary?.failedSections.includes(section) ?? false;

  const emailRow: SectionState<EmailRowVM> | null = summary
    ? hasFailed('account') || summary.account === null
      ? { kind: 'error' }
      : {
          kind: 'data',
          data: {
            status: deriveEmailStatus(summary.account.email, summary.account.isEmailVerified),
            email: summary.account.email,
          },
        }
    : isFullError
      ? { kind: 'error' }
      : null;

  const planRow: SectionState<PlanRowVM> | null = summary
    ? hasFailed('plan') || summary.plan === null
      ? { kind: 'error' }
      : { kind: 'data', data: toPlanRowVM(summary.plan) }
    : isFullError
      ? { kind: 'error' }
      : null;

  /** 요약 실패 시 행은 정상 동작하고 "N개 선택" 표기만 뺀다 — 이동은 서버 값이 필요 없다 */
  const interestCount: number | null =
    summary && !hasFailed('interest_summary') && summary.interestSummary !== null
      ? summary.interestSummary.count
      : null;

  /** 조회 전·전체 실패에는 null — 토글 기준값이 없으면 낙관적 UI를 시작할 수 없다(settings-api.md 4.1) */
  const controls: SettingsControlsVM | null = summary
    ? {
        playbackRate: overlay.defaultPlaybackRate ?? summary.settings.defaultPlaybackRate,
        isDripNotificationEnabled:
          overlay.isDripNotificationEnabled ?? summary.settings.isDripNotificationEnabled,
        isMarketingAgreed: overlay.isMarketingAgreed ?? summary.marketingConsent.isAgreed,
      }
    : null;

  const retry = (): void => {
    if (query.isFetching) return; // 연타는 인플라이트 요청이 있으면 무시한다
    void query.refetch();
  };

  return {
    /** 상단 카드 스켈레톤 여부는 화면이 useDelayedVisible(0.3초 규칙)로 감싼다 */
    isInitialLoading: query.isPending,
    /** 토글 값 조회 실패는 응답 전체 실패이므로 토글 섹션도 에러 영역에 포함된다(S6) */
    isFullError,
    emailRow,
    planRow,
    interestCount,
    controls,
    retry,
    isRetrying: query.isFetching,

    /** 유도 배너 — OS 권한 미결정에만. 닫기 없음, 권한 결정이 곧 숨김 조건(settings-uiux.md 4.3) */
    isNotificationBannerVisible: osPermission === 'undetermined',
    /** 권한이 거부·미결정이면 켜기 전 안내가 필요하므로 토글을 비활성 톤으로 그린다(표시만, 조작은 가능) */
    isDripToggleDimmed: osPermission !== 'granted',
    toggleDripNotification,
    toggleMarketingConsent,

    isPermissionDialogVisible,
    closePermissionDialog: () => setIsPermissionDialogVisible(false),
    openOsSettings,

    isPrePromptVisible,
    openPrePrompt: () => setIsPrePromptVisible(true),
    finishPrePrompt,

    isRateSheetVisible,
    openRateSheet: () => setIsRateSheetVisible(true),
    closeRateSheet: () => setIsRateSheetVisible(false),
    selectPlaybackRate,

    isLogoutDialogVisible,
    openLogoutDialog: () => setIsLogoutDialogVisible(true),
    closeLogoutDialog: () => {
      if (isLoggingOut) return; // 처리 중에는 팝업을 닫지 않는다(settings-uiux.md 4.4)
      setIsLogoutDialogVisible(false);
    },
    isLoggingOut,
    confirmLogout,

    isContactFallbackVisible,
    closeContactFallback: () => setIsContactFallbackVisible(false),
    openContact,
    copyContactLink,
    openTerms,
    openPrivacyPolicy,
    openStore,

    /** 관리자 섹션 — 서버 판정 boolean 하나. account 실패 시 노출하지 않는다(안전한 기본값) */
    isAdmin: summary?.account?.isAdmin ?? false,
    /** 서버 update_available 판정 결과 — 클라이언트가 버전을 비교하지 않는다 */
    isUpdateAvailable: summary?.version.updateAvailable ?? false,

    goBack: () => navigation.goBack(),
    openPlan: () => openDestination('Subscription'),
    openEmail: () => openDestination('EmailVerification'),
    openInterests: () => openDestination('InterestManagement'),
    openCareer: () => openDestination('Career'),
    openNotice: () => openDestination('Notice'),
    openWithdrawal: () => openDestination('Withdrawal'),
    openAdmin: () => openDestination('Admin'),
  };
};
