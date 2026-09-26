import { requireOptionalNativeModule } from 'expo-modules-core';

interface ZoomTransitionNative {
  arm(testId: string): Promise<string>;
  disarm(): void;
  setInteractiveDismissBlocked?(blocked: boolean): void;
}

const native = requireOptionalNativeModule<ZoomTransitionNative>('ZoomTransition');

/** 이 빌드에 모듈이 들어 있는가(runtime 12 부터). 없으면 호출부가 종전 JS 모핑을 쓴다 */
export const hasZoomTransitionModule = (): boolean => native !== null;

/**
 * 다음에 뜨는 모달을 `testID` 가 붙은 **보이는** 뷰에서 부풀어 오르게 등록한다(iOS 18 줌 전환). 등록은 1회성 —
 * RNS 패치가 모달을 띄우며 가져간다. 반환은 진단 문자열: `armed` 만 성공. 실패면 호출부는 그냥 navigate 한다(기본 모달 전환)
 */
export const armZoomTransition = async (testId: string): Promise<string> => {
  if (!native) return 'no-module';
  try {
    return await native.arm(testId);
  } catch (error) {
    return `error:${error instanceof Error ? error.message : String(error)}`;
  }
};

export const disarmZoomTransition = (): void => {
  native?.disarm();
};

/**
 * 시스템의 드래그·핀치 닫기를 막는다/푼다 — 패널(재생 목록·대본)이 열려 있거나 손가락이 스크롤 목록 위에서 시작했을 때.
 * 동기라 터치 시작 핸들러에서 불러도 시스템 제스처가 시작되기 전에 반영된다. 옛 네이티브(rt 12)엔 없다 — 그럼 no-op
 */
export const setZoomInteractiveDismissBlocked = (blocked: boolean): void => {
  native?.setInteractiveDismissBlocked?.(blocked);
};
