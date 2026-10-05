import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { ComponentType, ReactNode } from 'react';

import type { PaywallPlansSectionProps } from './PaywallPlansSection';

// 렌더러는 jest-expo의 의존성이다. 검증에 필요한 공개 API만 선언한다(Skeleton.test.tsx 와 같은 방식)
interface Renderer {
  toJSON(): unknown;
  unmount(): void;
}
const { act, create } = jest.requireActual<{
  act(callback: () => void): void;
  create(element: ReactNode): Renderer;
}>('react-test-renderer');

/** 결제 네이티브 모듈 유무 — 테스트마다 바꾼다 */
let mockNativeIap: unknown = null;
jest.mock('expo-modules-core', () => ({
  ...jest.requireActual<object>('expo-modules-core'),
  requireOptionalNativeModule: () => mockNativeIap,
}));

/** 빌드 플래그·모듈 유무를 정한 뒤 모듈을 새로 읽는다 — 플래그는 모듈을 읽는 시점에 정해진다 */
const loadWith = (env: { flag: string | undefined; hasNativeIap: boolean }) => {
  if (env.flag === undefined) delete process.env.EXPO_PUBLIC_SUBSCRIPTION_UI;
  else process.env.EXPO_PUBLIC_SUBSCRIPTION_UI = env.flag;
  mockNativeIap = env.hasNativeIap ? {} : null;
  let loaded!: {
    isEnabled: boolean;
    Section: ComponentType<PaywallPlansSectionProps>;
  };
  jest.isolateModules(() => {
    loaded = {
      isEnabled: jest.requireActual<{ IS_SUBSCRIPTION_UI_ENABLED: boolean }>(
        '@/shared/lib/feature-flags',
      ).IS_SUBSCRIPTION_UI_ENABLED,
      Section: jest.requireActual<{ default: ComponentType<PaywallPlansSectionProps> }>(
        './PaywallPlansSection',
      ).default,
    };
  });
  return loaded;
};

const renderSection = (Section: ComponentType<PaywallPlansSectionProps>) => {
  let renderer!: Renderer;
  act(() => {
    renderer = create(
      <Section onEntitled={jest.fn()} onDelayed={jest.fn()} onEmailGate={jest.fn()} />,
    );
  });
  return renderer;
};

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SUBSCRIPTION_UI;
  mockNativeIap = null;
});

/**
 * 지금 스토어에 나가 있는 runtime 31 바이너리에는 결제 네이티브 모듈이 없다. 플래그가 켜진 번들이 OTA 로 그 바이너리에
 * 닿아도 페이월에 구독 문구가 한 글자도 나오면 안 된다(App Store 2.1(b) — KAN-120 이중 가드).
 */
describe('PaywallPlansSection — 구독 UI 이중 가드', () => {
  it('빌드 플래그가 꺼져 있으면 요금제 비교·결제 버튼을 그리지 않는다', () => {
    // given
    const { isEnabled, Section } = loadWith({ flag: undefined, hasNativeIap: true });

    // when
    const renderer = renderSection(Section);

    // then
    expect(isEnabled).toBe(false);
    expect(renderer.toJSON()).toBeNull();
    act(() => renderer.unmount());
  });

  it('빌드 플래그가 켜져 있어도 결제 네이티브 모듈이 없는 바이너리면 그리지 않는다', () => {
    // given
    const { isEnabled, Section } = loadWith({ flag: 'on', hasNativeIap: false });

    // when
    const renderer = renderSection(Section);

    // then
    expect(isEnabled).toBe(false);
    expect(renderer.toJSON()).toBeNull();
    act(() => renderer.unmount());
  });

  it('빌드 플래그가 켜지고 결제 모듈이 있는 iOS 바이너리에서만 켜진다', () => {
    // given · when
    const { isEnabled } = loadWith({ flag: 'on', hasNativeIap: true });

    // then
    expect(isEnabled).toBe(true);
  });
});
