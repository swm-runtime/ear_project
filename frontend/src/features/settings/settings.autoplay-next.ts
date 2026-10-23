import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

/**
 * 재생 목록 자동 재생(연속 재생 — `player.md` 4.2-4, PM 2026-10-23) 켜짐 여부. **기본은 꺼짐.** 설정이 소유하고 재생
 * 서비스가 공개 API(`isAutoplayNextEnabled`)로 읽는다 — player 는 이미 settings 에 의존한다(architecture.md 4.4).
 * 기기 설정이다 — 서버로 보내지 않는다(화면 모드와 같다). 재생 서비스가 편이 끝나는 순간 **동기로** 읽어야 해서
 * `expo-secure-store` 에 둔다(AsyncStorage 는 비동기).
 */
const STORAGE_KEY = 'ear.autoplayNext';

const readStored = (): boolean => {
  try {
    return SecureStore.getItem(STORAGE_KEY) === 'on';
  } catch {
    // 못 읽으면 꺼진 것으로 본다 — 켜는 건 사용자 동의라 모를 때는 끈다
    return false;
  }
};

interface AutoplayNextState {
  enabled: boolean;
}

const useAutoplayNextStore = create<AutoplayNextState>(() => ({ enabled: readStored() }));

export const isAutoplayNextEnabled = (): boolean => useAutoplayNextStore.getState().enabled;

export const useAutoplayNextEnabled = (): boolean => useAutoplayNextStore((s) => s.enabled);

export const setAutoplayNextEnabled = (enabled: boolean): void => {
  useAutoplayNextStore.setState({ enabled });
  try {
    SecureStore.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // 저장 실패 — 이번 실행에만 적용된다
  }
};
