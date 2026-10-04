import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { useSessionStore } from '@/features/auth';

import { fetchSignupTrial, profileKeys } from '../api/profile.api';
import type { PlanTrial } from '../profile.types';
import {
  markSignupTrialNoticeSeen,
  readSignupTrialNoticeSeenUserId,
  shouldShowSignupTrialNotice,
} from '../services/signup-trial-notice.service';

/** 앞의 안내(튜토리얼·알림 사전 안내)가 사라지고 한 박자 쉰다 — usePrePromptGate 와 같은 값. 곧바로 뜨면 같은 팝업의 연속으로 읽힌다 */
const REVEAL_DELAY_MS = 400;

/** 저장소를 아직 읽지 않았다 — null(아무도 안 봄)과 구분한다 */
const NOT_READ = Symbol('not-read');

/**
 * P11 가입 체험 안내 팝업의 게이트(profile-uiux.md 4.11).
 *
 * - **여는 계기는 온보딩을 막 끝낸 진입뿐이다**(`justCompletedOnboarding`). 그 밖의 진입에서는 저장소도 서버도 읽지 않는다.
 * - **체험 값이 있을 때만 그린다** — 스위치가 꺼진 동안 가입한 계정은 `plan.trial = null`이다(티어명으로 가정하지 않는다).
 * - 순서는 첫 사용 튜토리얼 → 알림 사전 안내 → 이 팝업이다. 앞의 둘이 끝났는지는 호출부(app)가 `isReady`로 알려 준다 —
 *   알림 사전 안내는 notification feature 소유라 profile이 직접 읽지 않는다(architecture.md 4.4).
 */
export const useSignupTrialNotice = (isReady: boolean) => {
  const justCompletedOnboarding = useSessionStore((s) => s.justCompletedOnboarding);
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const [seenUserId, setSeenUserId] = useState<string | null | typeof NOT_READ>(NOT_READ);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  // 무엇과 동기화하나: 기기 저장소의 "이미 본 계정" → 화면 상태. 가입 직후 진입에서만 읽는다
  useEffect(() => {
    if (!justCompletedOnboarding) return;
    let isCancelled = false;
    void readSignupTrialNoticeSeenUserId().then((value) => {
      if (!isCancelled) setSeenUserId(value);
    });
    return () => {
      isCancelled = true;
    };
  }, [justCompletedOnboarding]);

  const hasRead = seenUserId !== NOT_READ;
  const isAlreadySeen = hasRead && userId !== null && seenUserId === userId;

  // 이미 본 계정이면 서버도 부르지 않는다
  const trialQuery = useQuery({
    queryKey: profileKeys.signupTrial(),
    queryFn: fetchSignupTrial,
    enabled: justCompletedOnboarding && userId !== null && hasRead && !isAlreadySeen,
    // 한 실행에 한 번이면 된다 — 팝업을 닫은 뒤 다시 받을 이유가 없다
    staleTime: Infinity,
  });

  const trial: PlanTrial | null = trialQuery.data ?? null;
  const canShow =
    justCompletedOnboarding &&
    userId !== null &&
    hasRead &&
    !isDismissed &&
    shouldShowSignupTrialNotice({ trial, userId, seenUserId });

  // 무엇과 동기화하나: 앞 안내 종료 + 체험 값 도착 → 한 박자 쉬고 연다
  useEffect(() => {
    if (!isReady || !canShow) return;
    const timer = setTimeout(() => setIsRevealed(true), REVEAL_DELAY_MS);
    // 조건이 닫히면 지연을 처음부터 다시 센다 — 앞 안내가 되살아난 뒤 곧바로 튀지 않게
    return () => {
      clearTimeout(timer);
      setIsRevealed(false);
    };
  }, [isReady, canShow]);

  /** [확인]·딤 탭·뒤로가기 — 모두 "봤다"로 기록한다. 안내뿐이라 고를 선택지가 없다 */
  const dismiss = useCallback(() => {
    setIsDismissed(true);
    if (userId !== null) void markSignupTrialNoticeSeen(userId);
  }, [userId]);

  return {
    trial,
    isVisible: isReady && canShow && isRevealed,
    dismiss,
  };
};
