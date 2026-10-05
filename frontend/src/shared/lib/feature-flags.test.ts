import { describe, expect, it, jest } from '@jest/globals';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { hasNativeIapModule, resolveSubscriptionUiEnabled } from './feature-flags';

// 모듈을 읽는 시점(IS_SUBSCRIPTION_UI_ENABLED 계산)에도 불리므로 팩토리 안에서 만든다
jest.mock('expo-modules-core', () => ({
  ...jest.requireActual<object>('expo-modules-core'),
  requireOptionalNativeModule: jest.fn(() => null),
}));
const mockRequireOptionalNativeModule = jest.mocked(requireOptionalNativeModule);

const ON = { buildFlag: true, androidFlag: false, platform: 'ios', hasNativeIap: true };

describe('구독 UI 노출 판정(KAN-120 — 플래그 · 결제 모듈 · 플랫폼 세 겹)', () => {
  describe('resolveSubscriptionUiEnabled', () => {
    it('빌드 플래그가 켜지고 결제 모듈이 있는 iOS 바이너리면 켠다', () => {
      expect(resolveSubscriptionUiEnabled(ON)).toBe(true);
    });

    it('빌드 플래그가 꺼져 있으면 결제 모듈이 있어도 끈다', () => {
      expect(resolveSubscriptionUiEnabled({ ...ON, buildFlag: false })).toBe(false);
    });

    it('플래그가 켜진 번들이 결제 모듈 없는 옛 바이너리(runtime 31)에 닿으면 끈다', () => {
      expect(resolveSubscriptionUiEnabled({ ...ON, hasNativeIap: false })).toBe(false);
    });

    it('Android 는 Play 상품 등록 전까지 별도 플래그가 꺼져 있으면 끈다', () => {
      expect(resolveSubscriptionUiEnabled({ ...ON, platform: 'android' })).toBe(false);
    });

    it('Android 플래그까지 켜지면 Android 에서도 켠다', () => {
      expect(resolveSubscriptionUiEnabled({ ...ON, platform: 'android', androidFlag: true })).toBe(
        true,
      );
    });

    it('웹 등 스토어가 없는 플랫폼에서는 끈다', () => {
      expect(resolveSubscriptionUiEnabled({ ...ON, platform: 'web', androidFlag: true })).toBe(
        false,
      );
    });
  });

  describe('hasNativeIapModule', () => {
    it('ExpoIap 네이티브 모듈이 없으면 false 다(throw 하지 않는다)', () => {
      // given
      mockRequireOptionalNativeModule.mockReturnValue(null);

      // when · then
      expect(hasNativeIapModule()).toBe(false);
      expect(mockRequireOptionalNativeModule).toHaveBeenCalledWith('ExpoIap');
    });

    it('ExpoIap 네이티브 모듈이 있으면 true 다', () => {
      // given
      mockRequireOptionalNativeModule.mockReturnValue({});

      // when · then
      expect(hasNativeIapModule()).toBe(true);
    });
  });
});
