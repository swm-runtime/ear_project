import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * 약한 눈금 진동 — 슬라이더가 한 칸을 넘을 때(재생 바 구간 경계 등). iOS 는 선택 피드백(UISelectionFeedbackGenerator),
 * Android 는 시계 눈금(`CLOCK_TICK` — 모든 API 레벨. `SEGMENT_TICK` 은 34 미만에서 예외).
 * 네이티브 모듈이 없는 빌드(rt 32 첫 개발계 빌드 등)·웹에서는 조용히 넘어간다 — 진동은 장식이지 정보가 아니다
 */
export const tickHaptic = (): void => {
  const run =
    Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick)
      : Haptics.selectionAsync();
  run.catch(() => undefined);
};
