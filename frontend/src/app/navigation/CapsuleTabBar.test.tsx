import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  type PanResponderCallbacks,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';

import CapsuleTabBar from './CapsuleTabBar';

jest.mock('react-native', () => {
  const actual = jest.requireActual<typeof import('react-native')>('react-native');
  actual.Platform.OS = 'android';
  return actual;
});
jest.mock('@react-navigation/bottom-tabs', () => ({
  BottomTabBarHeightCallbackContext: jest
    .requireActual<typeof import('react')>('react')
    .createContext(null),
}));
jest.mock('@/features/player', () => ({
  MiniPlayer: () => null,
  useMiniPlayerInset: () => 0,
  miniDropStyle: () => ({}),
  miniDropProgress: 0,
}));
jest.mock('@/shared/ui/GlassSurface', () => ({
  __esModule: true,
  default: () => null,
  GlassGroup: () => null,
  GlassPill: () => null,
}));
jest.mock('@/shared/ui/TabBarIcon', () => () => null);

interface Renderer {
  update(node: ReactNode): void;
  unmount(): void;
}
const { act, create } = jest.requireActual<{
  act(callback: () => Promise<void>): Promise<void>;
  create(node: ReactNode): Renderer;
}>('react-test-renderer');
const event = {} as GestureResponderEvent;
const gesture = (dx = 0) => ({ dx }) as PanResponderGestureState;

afterEach(() => {
  jest.restoreAllMocks();
});

async function mount(index = 0, prevented = false) {
  const handlers: PanResponderCallbacks[] = [];
  jest.spyOn(PanResponder, 'create').mockImplementation((config) => {
    handlers.push(config);
    return { panHandlers: {} };
  });
  const spring = jest
    .spyOn(Animated, 'spring')
    .mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
  const navigate = jest.fn();
  const emit = jest.fn(() => ({ defaultPrevented: prevented }));
  const props = {
    state: {
      index,
      routes: [
        { key: 'lib', name: 'Library' },
        { key: 'exp', name: 'Explore' },
        { key: 'pro', name: 'Profile' },
      ],
    },
    descriptors: { lib: { options: {} }, exp: { options: {} }, pro: { options: {} } },
    navigation: { navigate, emit },
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  } as unknown as BottomTabBarProps;
  let renderer!: Renderer;
  await act(async () => {
    renderer = create(<CapsuleTabBar {...props} />);
  });
  return { handlers, spring, navigate, emit, renderer, props };
}

describe('Android 하단 탭 누름', () => {
  it('손을 떼기 전에 화면과 알약을 선택하고 release 때 중복 선택하지 않는다', async () => {
    const { handlers, spring, navigate, emit, renderer } = await mount();
    handlers[1].onPanResponderGrant?.(event, gesture());
    expect(navigate).toHaveBeenCalledWith('Explore');
    expect(spring.mock.calls.at(-1)?.[1].toValue).toEqual(expect.any(Number));
    expect(spring.mock.calls.at(-1)?.[1].toValue).not.toBe(0);
    handlers[1].onPanResponderRelease?.(event, gesture());
    expect(emit).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('현재 탭을 길게 눌러도 재탭 이벤트를 한 번만 보낸다', async () => {
    const { handlers, emit, navigate, renderer } = await mount();
    handlers[0].onPanResponderGrant?.(event, gesture());
    handlers[0].onPanResponderRelease?.(event, gesture());
    expect(emit).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('누른 탭에서 끌면 놓은 칸으로 이동한다', async () => {
    const { handlers, navigate, renderer, props } = await mount();
    handlers[1].onPanResponderGrant?.(event, gesture());
    await act(async () => {
      renderer.update(<CapsuleTabBar {...props} state={{ ...props.state, index: 1 }} />);
    });
    await act(async () => {
      handlers[1].onPanResponderMove?.(event, gesture(1000));
      handlers[1].onPanResponderRelease?.(event, gesture(1000));
    });
    expect(navigate).toHaveBeenLastCalledWith('Profile');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('선택 이벤트가 취소되면 알약도 원래 탭을 유지한다', async () => {
    const { handlers, spring, navigate, renderer } = await mount(0, true);
    handlers[1].onPanResponderGrant?.(event, gesture());
    expect(navigate).not.toHaveBeenCalled();
    expect(spring.mock.calls.at(-1)?.[1].toValue).toBe(0);
    await act(async () => {
      renderer.unmount();
    });
  });
});
