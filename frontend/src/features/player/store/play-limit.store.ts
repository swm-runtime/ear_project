import { create } from 'zustand';

import type { PlayLimitSnapshot } from '../player.types';

interface PlayLimitStore {
  /**
   * 잔여 재생 표시값 — 목록·복원·재생 시작 응답의 서버 값으로만 덮어쓴다.
   * 클라이언트가 임의로 1을 빼거나 기기 시각으로 리셋하지 않는다(library.md 4.1-2).
   */
  playLimit: PlayLimitSnapshot | null;
  /**
   * [오늘은 그만 보기]로 확인 팝업을 억제한 서비스 날짜(기기 로컬 — 서버에 저장하지 않는다).
   * 서버가 내려준 service_date와 다르면 억제가 풀린 것으로 본다(library.md 4.3).
   */
  suppressedServiceDate: string | null;
  applyPlayLimit: (incoming: PlayLimitSnapshot) => void;
  setSuppressedServiceDate: (serviceDate: string | null) => void;
}

/**
 * 신선도 가드 — 탭 전환 시 렌더되는 낡은 쿼리 캐시가 최신 값을 역행 덮어쓰지 못하게 한다.
 * 시계를 쓰지 않고 도메인 성질로 판정한다: 같은 서비스 날짜 안에서 daily_play_count는
 * 단조 증가다(play_records는 추가만 되고, 삭제해도 재생 이력은 남는다 — library.md 4.5).
 * 줄어드는 유일한 경우는 04:00 경계인데 그때는 service_date 자체가 바뀐다.
 */
const isFresher = (incoming: PlayLimitSnapshot, current: PlayLimitSnapshot | null): boolean => {
  if (current === null) return true;
  // 날짜가 바뀌었다(04:00 경계) — 무조건 새 값이다
  if (incoming.serviceDate !== current.serviceDate) return true;
  // 한도가 바뀌었다(티어 변경 — 결제·만료) — 새 값으로 본다
  if (incoming.dailyPlayLimit !== current.dailyPlayLimit) return true;
  // 같은 날짜·같은 한도 — count가 작으면 차감 전의 낡은 응답이므로 버린다
  return (incoming.dailyPlayCount ?? 0) >= (current.dailyPlayCount ?? 0);
};

export const usePlayLimitStore = create<PlayLimitStore>((set) => ({
  playLimit: null,
  suppressedServiceDate: null,
  applyPlayLimit: (incoming) =>
    set((state) => (isFresher(incoming, state.playLimit) ? { playLimit: incoming } : state)),
  setSuppressedServiceDate: (serviceDate) => set({ suppressedServiceDate: serviceDate }),
}));
