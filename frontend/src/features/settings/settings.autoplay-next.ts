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

/**
 * **추천 이어 틀기**(player.md 4.2-4, PM 2026-10-23 "플레이어의 자동 재생 칩은 추천만 자동 재생 켜는 스위치") — 재생 목록이 끝났을 때
 * 비슷한 추천 편으로 넘어갈지. 플레이어 재생 목록의 추천 섹션 옆 [자동 재생] 스위치가 토글한다. **위 [재생 목록 자동 재생]이
 * 켜져 있을 때만 의미가 있다**(꺼져 있으면 스위치가 흐려지고 눌리지 않는다). **기본은 켜짐** — 연속 재생을 일부러 켠 사람은
 * 끊기지 않기를 원했다고 본다. 기기 설정이다
 */
const RECOMMENDED_STORAGE_KEY = 'ear.autoplayRecommended';

const readRecommendedStored = (): boolean => {
  try {
    return SecureStore.getItem(RECOMMENDED_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
};

const useAutoplayRecommendedStore = create<AutoplayNextState>(() => ({
  enabled: readRecommendedStored(),
}));

export const isAutoplayRecommendedEnabled = (): boolean =>
  useAutoplayRecommendedStore.getState().enabled;

export const useAutoplayRecommendedEnabled = (): boolean =>
  useAutoplayRecommendedStore((s) => s.enabled);

export const setAutoplayRecommendedEnabled = (enabled: boolean): void => {
  useAutoplayRecommendedStore.setState({ enabled });
  try {
    SecureStore.setItem(RECOMMENDED_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // 저장 실패 — 이번 실행에만 적용된다
  }
};
