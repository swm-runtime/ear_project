import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

import { armZoomTransition, hasZoomTransitionModule } from '../../../modules/zoom-transition/src';

/**
 * 플레이어를 **iOS 18 줌 전환**으로 띄우는가 — 미니플레이어 카드에서 부풀어 오르고, 닫으면 그 자리로 줄어든다
 * (애플 뮤직 Now Playing, PM 2026-09-26 03:55 "1 ㄱㄱ"). 조건: iOS 26 시스템 탭 바 갈래 + 로컬 모듈이 든 빌드(runtime 12).
 * 아니면 종전 JS 모핑(transparentModal + 화면이 직접 그리는 확대·축소).
 *
 * 줌 전환은 RNS 패치(`patches/react-native-screens`)가 모달을 띄우기 직전에 등록된 소스 뷰를 읽어 건다 —
 * `armPlayerZoom` 으로 등록하고 곧바로 navigate 해야 한다.
 */
export const USE_NATIVE_PLAYER_ZOOM = HAS_NATIVE_TAB_BAR && hasZoomTransitionModule();

/** 마지막 등록 결과 — 실기기 진단용 */
let lastArmResult = 'not-called';
export const getLastPlayerZoomArmResult = (): string => lastArmResult;

/** 미니플레이어 카드 루트의 testID — 네이티브가 이 값으로 지금 보이는 카드를 찾는다 */
export const MINI_PLAYER_ZOOM_SOURCE_ID = 'mini-player-zoom-source';

/**
 * 다음에 뜨는 플레이어 모달이 미니플레이어 카드에서 부풀어 오르게 등록한다. 줌을 안 쓰는 갈래·뷰 없음이면
 * 아무것도 하지 않고 돌아온다 — 호출부는 그 뒤 그냥 navigate 한다
 */
export const armPlayerZoom = async (): Promise<void> => {
  if (!USE_NATIVE_PLAYER_ZOOM) return;
  lastArmResult = await armZoomTransition(MINI_PLAYER_ZOOM_SOURCE_ID);
};
