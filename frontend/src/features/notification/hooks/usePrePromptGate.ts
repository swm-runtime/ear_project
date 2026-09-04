import { useEffect, useState } from 'react';

import { useWalkthroughStore } from '@/shared/ui/walkthrough.store';

import { useNotificationStore } from '../store/notification.store';

/**
 * 코치마크가 끝난 뒤에야 알림 사전 안내가 뜨도록 여는 게이트(2026-09-04).
 *
 * 왜 기다리나: OS 권한은 한 번 거부되면 앱에서 다시 요청할 수 없다(notification.md 4.1).
 * 거부율을 낮추려고 사전 안내를 두었으므로, "매일 아침 2편이 도착한다"를 코치마크가
 * 방금 설명한 직후 — 가장 설득력 있는 순간 — 에 물어야 한다. 두 신호가 온보딩 종료 시
 * 동시에 세워져(`CompleteScreen`) 모달이 코치마크를 덮던 것도 함께 없앤다.
 *
 * 코치마크를 [건너뛰기]로 끝낸 경우에도 열린다 — 튜토리얼을 건너뛴 것이지 알림을
 * 건너뛴 것이 아니다. 코치마크가 애초에 없는 진입(설정 유도 배너 등)은 즉시 연다.
 */
const REVEAL_DELAY_MS = 400;

export function usePrePromptGate(): boolean {
  const isPrePromptPending = useNotificationStore((s) => s.isPrePromptPending);
  const isWalkthroughPending = useWalkthroughStore((s) => s.pending);
  const [isRevealed, setIsRevealed] = useState(false);

  // 무엇과 동기화하나: 두 신호 → 코치마크가 비워진 뒤 한 박자 쉬고 모달을 연다.
  // 오버레이가 사라지자마자 모달이 튀면 같은 팝업의 연속처럼 읽힌다
  useEffect(() => {
    if (!isPrePromptPending || isWalkthroughPending) return;
    const timer = setTimeout(() => setIsRevealed(true), REVEAL_DELAY_MS);
    // 조건이 닫히면 지연을 처음부터 다시 센다 — 되돌아온 뒤 곧바로 튀지 않게
    return () => {
      clearTimeout(timer);
      setIsRevealed(false);
    };
  }, [isPrePromptPending, isWalkthroughPending]);

  return isPrePromptPending && !isWalkthroughPending && isRevealed;
}
