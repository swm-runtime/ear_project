import { useCallback, useEffect, useState } from 'react';

import { useSessionStore } from '@/features/auth';

import {
  markAutoExpandNoticeSeen,
  readAutoExpandNoticeSeenUserId,
  shouldShowAutoExpandNotice,
} from '../services/auto-expand-notice.service';

/** 저장소를 아직 읽지 않았다 — null(아무도 안 봄)과 구분한다 */
const NOT_READ = Symbol('not-read');

/**
 * 자동 추가 주제 안내 팝업의 게이트(KAN-181 · PM 2026-10-15).
 *
 * - **여는 조건은 "자동 추가 주제가 지금 하나라도 있고(`hasAutoExpand`), 이 계정이 이 안내를 아직 본 적이 없다" 하나다.**
 *   빗금이 실제로 떠 있는 화면에서 그 빗금을 설명한다 — 화면 진입 시 판정한다.
 * - 안내뿐이라 고를 선택지가 없다: [확인]·딤 탭·뒤로가기 모두 "봤다"로 기록한다.
 * - 계정 id 로 비교하므로 다른 계정으로 로그인하면 다시 뜬다. 기기 저장소는 화면 마운트마다 한 번 읽는다
 *   (계정이 바뀌면 화면이 새로 마운트된다 — `useSignupTrialNotice` 와 같은 결).
 */
export const useAutoExpandNotice = (hasAutoExpand: boolean) => {
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const [seenUserId, setSeenUserId] = useState<string | null | typeof NOT_READ>(NOT_READ);
  const [isDismissed, setIsDismissed] = useState(false);

  // 무엇과 동기화하나: 기기 저장소의 "이미 본 계정" → 화면 상태. 진입(마운트)마다 한 번 읽는다
  useEffect(() => {
    let isCancelled = false;
    void readAutoExpandNoticeSeenUserId().then((value) => {
      if (!isCancelled) setSeenUserId(value);
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  const hasRead = seenUserId !== NOT_READ;
  const isVisible =
    userId !== null &&
    hasRead &&
    !isDismissed &&
    shouldShowAutoExpandNotice({
      hasAutoExpand,
      userId,
      seenUserId: seenUserId as string | null,
    });

  /** [확인]·딤 탭·뒤로가기 — 모두 "봤다"로 기록한다. 안내뿐이라 고를 선택지가 없다 */
  const dismiss = useCallback(() => {
    setIsDismissed(true);
    if (userId !== null) void markAutoExpandNoticeSeen(userId);
  }, [userId]);

  return { isVisible, dismiss };
};
