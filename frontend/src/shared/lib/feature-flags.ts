import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

/**
 * 빌드 타임 기능 플래그 — `EXPO_PUBLIC_*` 는 번들에 인라인되므로 켜고 끄려면 새 번들(OTA 또는 빌드)이
 * 필요하다. 서버 설정처럼 나중에 바꿀 수 없다는 점을 알고 쓴다.
 */

/**
 * 결제 네이티브 모듈(expo-iap)의 이름 — 이 모듈이 바이너리에 없으면 결제를 할 수 없다.
 * runtimeVersion 31 이하의 스토어·내부 빌드에는 없다(KAN-120 — 32 묶음 빌드에서 들어간다).
 */
const IAP_NATIVE_MODULE_NAME = 'ExpoIap';

export interface SubscriptionUiInputs {
  /** `EXPO_PUBLIC_SUBSCRIPTION_UI === 'on'` — 결제가 붙은 빌드에서만 켠다 */
  buildFlag: boolean;
  /** `EXPO_PUBLIC_SUBSCRIPTION_ANDROID === 'on'` — Play 상품 등록(KAN-130) 전까지 끈다 */
  androidFlag: boolean;
  platform: string;
  /** 결제 네이티브 모듈이 이 바이너리에 실려 있는가 */
  hasNativeIap: boolean;
}

/**
 * 구독 UI 를 그릴 수 있는가 — **세 겹이 전부 열려야 켜진다**(KAN-120).
 *
 * 1. 빌드 플래그 — 번들에 박히는 값. 기본 꺼짐이고 `on` 을 명시해야 켜진다(env 누락이 사고가 되지 않는 쪽).
 * 2. 결제 네이티브 모듈 유무 — **런타임 검사**. 플래그가 켜진 번들이 OTA 로 옛 바이너리(모듈 없음)에 닿아도
 *    구독 버튼만 보이고 결제가 안 되는 상태가 되지 않는다(App Store 반려 2.1(b)). 플래그 하나만 믿으면 OTA 경로
 *    (특히 iOS 백필처럼 옛 runtimeVersion 으로 나가는 발행)에서 새는 구멍이 생긴다.
 * 3. 플랫폼 — Android 는 Play 상품이 등록되기 전까지(KAN-130) 별도 플래그로 막는다. 라이브러리는 바이너리에
 *    실리지만(Play Console 상품 메뉴를 여는 조건) 화면은 숨긴다.
 */
export const resolveSubscriptionUiEnabled = (inputs: SubscriptionUiInputs): boolean => {
  if (!inputs.buildFlag || !inputs.hasNativeIap) return false;
  if (inputs.platform === 'ios') return true;
  if (inputs.platform === 'android') return inputs.androidFlag;
  return false;
};

/** 결제 네이티브 모듈이 이 바이너리에 있는가 — 없으면 null 이 돌아온다(throw 하지 않는다) */
export const hasNativeIapModule = (): boolean =>
  requireOptionalNativeModule(IAP_NATIVE_MODULE_NAME) != null;

/**
 * 구독 UI 노출 — **결제가 붙은 바이너리에서만 켠다**(KAN-66 → KAN-120).
 *
 * App Store 심사 2.1(b): 인앱 결제 상품 없이 "구독"을 언급하면 반려된다. 이 값이 꺼져 있으면
 * 설정 구독 섹션·프로필 [구독 알아보기]·잔여 재생 소진 라벨의 구독 안내·탈퇴 사유 "구독 가격"·
 * 페이월의 요금제 비교를 전부 **비노출**한다. 삭제가 아니다.
 *
 * 켜는 곳: 결제 라이브러리가 든 묶음 빌드(runtimeVersion 32)의 `eas.json` 프로필 env 와
 * `.github/workflows/eas-update.yml` 의 OTA env 에 **같은 값**을 둔다 — preview(개발계) `on`, production(운영) `off`(2026-10-07 PM — 스토어 상품·서버 결제 키·유료 앱 계약 전).
 * 켜더라도 결제 네이티브 모듈이 없는 바이너리에서는 꺼진 채로 남는다(위 resolveSubscriptionUiEnabled).
 */
export const IS_SUBSCRIPTION_UI_ENABLED = resolveSubscriptionUiEnabled({
  buildFlag: process.env.EXPO_PUBLIC_SUBSCRIPTION_UI === 'on',
  androidFlag: process.env.EXPO_PUBLIC_SUBSCRIPTION_ANDROID === 'on',
  platform: Platform.OS,
  hasNativeIap: hasNativeIapModule(),
});
