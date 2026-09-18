import { create } from 'zustand';

import type { SleepTimerChoice } from '../services/sleep-timer';

interface SleepTimerStore {
  /** 설정된 선택지 — 없으면 꺼짐 */
  choice: SleepTimerChoice | null;
  /** 분 단위 타이머의 남은 초 — "이 에피소드 종료 시"·꺼짐이면 null */
  remainingSec: number | null;
  set: (choice: SleepTimerChoice | null, remainingSec: number | null) => void;
  tick: (remainingSec: number) => void;
}

/**
 * 수면 타이머의 화면용 상태. 시간을 세고 만료를 처리하는 것은 `sleep-timer.service`이고, 여기는 그 결과를
 * 플레이어가 구독해 그리는 자리다. 플레이어 화면을 닫아도(미니플레이어) 타이머는 계속 가야 하므로 화면 state 가 아니다.
 */
export const useSleepTimerStore = create<SleepTimerStore>((set) => ({
  choice: null,
  remainingSec: null,
  set: (choice, remainingSec) => set({ choice, remainingSec }),
  tick: (remainingSec) => set({ remainingSec }),
}));
