import { track } from '@/shared/analytics';
import { useToastStore } from '@/shared/ui/toast.store';

import { PLAYER_COPY } from '../player.copy';
import RemainingPlaysIndicator from './RemainingPlaysIndicator';
import { usePlayLimitStore } from '../store/play-limit.store';

/**
 * 내비게이션 바 오른쪽의 잔여 재생 링 — iOS 26 큰 제목 바로 옮긴 탐색 머리 줄의 잔여 표시(explore.md 4.4-1).
 * 바 아이템은 화면 훅 밖(내비게이터 옵션)에서 그려지므로 스토어를 직접 읽는다 — 판정은 여전히 서버 값이다.
 * 무제한·값 없음이면 아무것도 그리지 않는다(자리를 비운다). 소진 탭 → 페이월(usePlayGate.openPaywall 과 같은 동작).
 */
export default function RemainingPlaysHeaderItem() {
  const playLimit = usePlayLimitStore((s) => s.playLimit);
  const showToast = useToastStore((s) => s.show);
  if (!playLimit || playLimit.dailyPlayLimit === null || playLimit.dailyPlayCount === null) {
    return null;
  }
  const remaining = Math.max(0, playLimit.dailyPlayLimit - playLimit.dailyPlayCount);
  return (
    <RemainingPlaysIndicator
      remaining={remaining}
      limit={playLimit.dailyPlayLimit}
      onExhaustedPress={() => {
        // TODO(paywall feature): 페이월 바텀시트로 교체 — usePlayGate.openPaywall 과 같은 자리
        track('paywall_view', { entry: 'explore' });
        showToast(PLAYER_COPY.paywallPlaceholderToast);
      }}
    />
  );
}
