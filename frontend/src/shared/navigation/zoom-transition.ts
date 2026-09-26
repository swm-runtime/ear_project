import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

import {
  armZoomTransition,
  dismissPresentedScreenNatively,
  getZoomTransitionDiagnostics,
  hasZoomTransitionModule,
  setZoomInteractiveDismissBlocked,
} from '../../../modules/zoom-transition/src';

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

/**
 * 줌으로 띄운 플레이어를 닫는다 — **UIKit 이 먼저 닫고, 라우트 pop 은 RNS 의 onDismissed 가 한다.** JS 가 먼저 goBack 하면
 * RNS 가 dismiss 전에 화면 뷰를 스냅샷으로 갈아끼우고 줌 dismiss 가 그 위에서 끝나지 못해 앱이 굳었다(2026-09-27 02:57 실험:
 * 줌 등록만 끄면 안 굳는다). 네이티브가 없거나 떠 있는 모달을 못 찾으면 false — 호출부가 goBack 으로 대신한다
 */
export const dismissPlayerNatively = async (): Promise<boolean> => {
  if (!USE_NATIVE_PLAYER_ZOOM) return false;
  const result = await dismissPresentedScreenNatively();
  return result === 'dismissed';
};

/**
 * 플레이어 위에서 시스템의 드래그·핀치 닫기를 막는다/푼다 — 재생 목록·대본 패널이 열려 있거나 손가락이 스크롤 목록 위에서
 * 시작했을 때(PM 2026-09-26 15:49 "재생목록 내려갈 때 미니플레이어도 같이 내려간다"). 줌을 안 쓰는 갈래는 no-op
 */
export const setPlayerZoomDismissBlocked = (blocked: boolean): void => {
  if (!USE_NATIVE_PLAYER_ZOOM) return;
  setZoomInteractiveDismissBlocked(SYSTEM_INTERACTIVE_DISMISS ? blocked : true);
};

/**
 * 시스템(UIKit 줌)의 드래그·핀치 닫기를 쓰는가. **iOS 26 의 알려진 버그로 끈다**(2026-09-27 01:51): iOS 26.0~26.1 은 줌 전환을
 * 인터랙티브로 닫으면 소스 뷰가 사라지거나 깜빡이고 기하가 어긋난다 — 애플 포럼 807208(애플 "알려진 이슈, 조사 중"), expo/expo
 * #50049. 우리 증상(드래그로 닫은 뒤 탭 전환 때 죽은 플레이어 뷰가 한 프레임)도 이 부류였고 RNS 패치 여섯 번으로 안 잡혔다.
 * 비인터랙티브 닫기(뒤로 버튼·goBack)는 멀쩡하므로 우리 끌어내리기가 임계를 넘으면 goBack — 줌 축소는 그대로, 손가락을
 * 따라오진 않는다. 애플이 고치면(iOS 26.2+) 버전 조건으로 다시 켠다
 */
export const SYSTEM_INTERACTIVE_DISMISS = false;

/** 플레이어 화면 마운트 횟수 — 진단(2026-09-26 20:52): 드래그 닫기 뒤 탭 전환 때 JS 가 플레이어를 다시 마운트하는지 가른다 */
let playerMountCount = 0;
export const notePlayerMounted = (): void => {
  playerMountCount += 1;
};
export const getPlayerMountCount = (): number => playerMountCount;

/** 네이티브(RNS 패치) 진단 — 닫힘 경로가 어디까지 왔는지 */
export const getPlayerZoomNativeDiagnostics = (): string => getZoomTransitionDiagnostics();
