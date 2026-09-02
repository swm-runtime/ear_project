import { create } from 'zustand';

/**
 * 알림 사전 안내를 **라이브러리 진입 시** 띄워야 하는지를 들고 있는 신호.
 *
 * 온보딩 마지막 화면이던 O10을 없애고 라이브러리 진입 모달로 옮기면서 생겼다(2026-09-02).
 * 온보딩 store에 둘 수 없다 — `exitOnboarding()`이 그 store를 통째로 초기화하므로
 * 라이브러리가 읽기 전에 값이 사라진다.
 *
 * TODO: MMKV 도입 시 영속한다(architecture.md 7.2). 지금은 메모리라 앱을 껐다 켜면
 * 사전 안내를 놓친다 — 설정의 유도 배너가 그 경우의 회수 경로다(notification.md 4.1).
 */
interface NotificationStore {
  isPrePromptPending: boolean;
  markPrePromptPending: () => void;
  clearPrePromptPending: () => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  isPrePromptPending: false,
  markPrePromptPending: () => set({ isPrePromptPending: true }),
  clearPrePromptPending: () => set({ isPrePromptPending: false }),
}));
