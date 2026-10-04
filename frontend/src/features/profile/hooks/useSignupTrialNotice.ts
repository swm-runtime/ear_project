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
 * - **여는 조건은 "체험 값이 있고(`plan.trial !== null`), 이 계정이 이 팝업을 아직 본 적이 없다" 하나다**(KAN-121, 2026-10-05).
 *   신규 가입자(온보딩 직후)와 체험 도입 전 가입자(서버가 앱을 연 날 체험을 준다 — subscription.md 4.8)가 같은 조건으로 걸린다.
 *   온보딩 직후 여부로 가르지 않는다 — 기존 가입자는 그 진입이 없다.
 * - **체험 값은 서버 것만 본다** — `user.tier === 'trial'` 로 가정하지 않는다(티어명 하드코딩 금지). 조회가 실패하면 띄우지 않고
 *   "봤다"로도 적지 않는다 — 다음 실행에서 다시 판정된다.
 * - 이미 본 계정이면 서버도 부르지 않는다. 보지 않은 계정은 Main 진입마다 한 번 프로필 요약을 받는다(체험이 없는 계정도 —
 *   스위치가 나중에 켜질 수 있어 "체험 없음"을 기억하지 않는다).
 * - 순서는 호출부(app)가 `isReady`로 알려 준다 — 신규 가입은 튜토리얼 → 알림 사전 안내 → 이 팝업, 기존 가입자는 앱 시작의 다른 팝업
 *   (권장 업데이트·푸시 재생 확인·한도 안내)이 없을 때다. 그 신호들은 다른 feature 소유라 profile이 직접 읽지 않는다(architecture.md 4.4).
 */
export const useSignupTrialNotice = (isReady: boolean) => {
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const [seenUserId, setSeenUserId] = useState<string | null | typeof NOT_READ>(NOT_READ);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  // 무엇과 동기화하나: 기기 저장소의 "이미 본 계정" → 화면 상태. Main 진입(마운트)마다 한 번 읽는다 — 계정이 바뀌면 Main이 새로 마운트된다
  useEffect(() => {
    let isCancelled = false;
    void readSignupTrialNoticeSeenUserId().then((value) => {
      if (!isCancelled) setSeenUserId(value);
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  const hasRead = seenUserId !== NOT_READ;
  const isAlreadySeen = hasRead && userId !== null && seenUserId === userId;

  // 이미 본 계정이면 서버도 부르지 않는다
  const trialQuery = useQuery({
    queryKey: profileKeys.signupTrial(),
    queryFn: fetchSignupTrial,
    enabled: userId !== null && hasRead && !isAlreadySeen,
    // Main 진입에 한 번이면 된다 — 팝업을 닫은 뒤 다시 받을 이유가 없다
    staleTime: Infinity,
    // Main 을 떠나면(로그아웃·계정 전환) 버린다 — 다음 진입은 그 계정의 값을 새로 받는다. 남겨 두면 다른 계정에 앞 계정의 날짜가
    // 뜨고, 같은 계정이 다시 로그인해 서버가 막 체험을 준 경우에도 "체험 없음"이 그대로 쓰인다
    gcTime: 0,
  });

  const trial: PlanTrial | null = trialQuery.data ?? null;
  const canShow =
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
