import { useEffect, useState } from 'react';

import { useNotificationStore } from '../store/notification.store';

/**
 * 알림 사전 안내를 신호가 선 뒤 **한 박자 쉬고** 여는 게이트(2026-09-04).
 *
 * 왜 기다리나: 온보딩 종료 → 착지 화면 전환 직후 모달이 바로 튀면 화면 전환과 팝업이 한 동작처럼 읽힌다.
 * 종전엔 첫 사용 튜토리얼(코치마크)이 끝나기를 함께 기다렸는데, 튜토리얼은 뺐다(PM 2026-10-11) — 이제
 * 지연만 남는다. OS 권한은 한 번 거부되면 앱에서 다시 요청할 수 없어(notification.md 4.1) 사전 안내 자체는 그대로다.
 */
const REVEAL_DELAY_MS = 400;

/**
 * @param isHeld 다른 화면이 먼저 떠 있어 기다려야 하는가 — 온보딩 직후 멈춘 채 연 플레이어(KAN-295)처럼 네이티브 모달이 떠
 *   있거나 뜨는 중이면 그 위에 이 모달을 겹치지 않는다(iOS 는 모달 위 모달에서 화면이 굳는다). 풀리면 지연을 처음부터 센다
 */
export function usePrePromptGate(isHeld = false): boolean {
  const isPrePromptPending = useNotificationStore((s) => s.isPrePromptPending);
  const [isRevealed, setIsRevealed] = useState(false);
  const isWaiting = isPrePromptPending && !isHeld;

  // 무엇과 동기화하나: 신호 → 한 박자 쉬고 모달을 연다
  useEffect(() => {
    if (!isWaiting) return;
    const timer = setTimeout(() => setIsRevealed(true), REVEAL_DELAY_MS);
    // 조건이 닫히면 지연을 처음부터 다시 센다 — 되돌아온 뒤 곧바로 튀지 않게
    return () => {
      clearTimeout(timer);
      setIsRevealed(false);
    };
  }, [isWaiting]);

  return isWaiting && isRevealed;
}
