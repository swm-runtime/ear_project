import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { Animated, StyleSheet } from 'react-native';

import BottomSheet from './BottomSheet';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

interface TestNode {
  type: unknown;
  props: Record<string, unknown>;
  findAll(predicate: (node: TestNode) => boolean): TestNode[];
}
interface Renderer {
  root: TestNode;
  update(element: ReactNode): void;
  unmount(): void;
}
const { act, create } = jest.requireActual<{
  act(callback: () => void): void;
  create(element: ReactNode): Renderer;
}>('react-test-renderer');

type Completion = (result: { finished: boolean }) => void;
const animations: {
  value: Animated.Value;
  target: number;
  complete?: Completion;
  stop: ReturnType<typeof jest.fn>;
}[] = [];
let renderer: Renderer;
const onClose = jest.fn();
const onHidden = jest.fn();
// Animated의 공개 타입에 없는 읽기 API는 테스트에서만 사용한다.
const read = (node: unknown) => (node as { __getValue(): number }).__getValue();
const sheet = (visible: boolean) => (
  <BottomSheet isVisible={visible} onRequestClose={onClose} onHidden={onHidden}>
    {null}
  </BottomSheet>
);
const update = (visible: boolean) => act(() => renderer.update(sheet(visible)));
const host = (prop: string) =>
  renderer.root.findAll((node) => typeof node.type === 'string' && prop in node.props)[0];
const show = () => act(() => (host('onShow').props.onShow as () => void)());
const measure = () =>
  act(() =>
    (host('onLayout').props.onLayout as (event: unknown) => void)({
      nativeEvent: { layout: { height: 320 } },
    }),
  );
const finish = (index: number) =>
  act(() => {
    const animation = animations[index];
    animation.value.setValue(animation.target);
    animation.complete?.({ finished: true });
  });

beforeEach(() => {
  animations.length = 0;
  onClose.mockClear();
  onHidden.mockClear();
  const animate = (value: Animated.Value, config: { toValue: number }) => {
    const animation = {
      value,
      target: config.toValue,
      complete: undefined as Completion | undefined,
      stop: jest.fn(() => animation.complete?.({ finished: false })),
    };
    animations.push(animation);
    return {
      start: (callback?: Completion) => {
        animation.complete = callback;
      },
      stop: animation.stop,
      reset: jest.fn(),
    };
  };
  jest.spyOn(Animated, 'spring').mockImplementation(animate as typeof Animated.spring);
  jest.spyOn(Animated, 'timing').mockImplementation(animate as typeof Animated.timing);
  act(() => {
    renderer = create(sheet(true));
  });
});

afterEach(() => {
  act(() => renderer.unmount());
  jest.restoreAllMocks();
});

describe('BottomSheet — 모달 표시와 모션 시작 순서', () => {
  it('높이가 먼저 있어도 네이티브 표시 전에는 딤과 시트 모션을 시작하지 않는다', () => {
    measure();
    expect(animations).toHaveLength(0);
    show();
    expect(animations).toHaveLength(1);
    expect(animations[0].target).toBe(1);
  });

  it('표시가 먼저 끝나도 높이를 재기 전에는 시작하지 않는다', () => {
    show();
    expect(animations).toHaveLength(0);
    measure();
    expect(animations).toHaveLength(1);
  });

  it('다시 열 때 남아 있는 높이로 모션을 먼저 시작하지 않는다', () => {
    measure();
    show();
    finish(0);
    update(false);
    expect(host('onShow').props.visible).toBe(true);
    finish(1);
    update(true);
    expect(animations).toHaveLength(2);
    show();
    expect(animations).toHaveLength(3);
    expect(read(animations[2].value)).toBe(0);
  });

  it('닫힘 중 다시 열면 이전 모션을 중단하고 모달을 유지한다', () => {
    measure();
    show();
    finish(0);
    update(false);
    update(true);
    expect(animations[1].stop).toHaveBeenCalledTimes(1);
    expect(host('onShow').props.visible).toBe(true);
    expect(animations[2].target).toBe(1);
    expect(onHidden).not.toHaveBeenCalled();
  });

  it('퇴장 완료 전에는 후속 동작을 부르지 않고 숨김 커밋 뒤 한 번 호출한다', () => {
    measure();
    show();
    finish(0);
    expect(onHidden).not.toHaveBeenCalled();
    update(false);
    expect(onHidden).not.toHaveBeenCalled();
    finish(1);
    expect(onHidden).toHaveBeenCalledTimes(1);
    update(false);
    expect(onHidden).toHaveBeenCalledTimes(1);
  });

  it('닫히는 중에 시트를 건드려도 다시 올라오지 않고 끝까지 닫힌다', () => {
    measure();
    show();
    finish(0);
    // 딤 Pressable 도 응답자 prop 을 갖는다 — 끌기 capture 를 가진 쪽이 시트다
    const handlers = () => host('onMoveShouldSetResponderCapture').props;
    expect((handlers().onStartShouldSetResponder as (e: unknown) => boolean)({})).toBe(true);
    update(false);
    // 닫힘 모션(0.24초) 도중의 탭 — 종전엔 응답자를 잡고 놓을 때 되돌림 스프링이 닫힘을 끊어 시트가 굳었다
    expect((handlers().onStartShouldSetResponder as (e: unknown) => boolean)({})).toBe(false);
    act(() => (handlers().onResponderRelease as (e: unknown) => void)({}));
    act(() => (handlers().onResponderTerminate as (e: unknown) => void)({}));
    expect(animations).toHaveLength(2);
    expect(animations[1].stop).not.toHaveBeenCalled();
    finish(1);
    expect(onHidden).toHaveBeenCalledTimes(1);
  });

  it('표시 준비 전에 닫힌 메뉴는 애니메이션 없이 숨긴다', () => {
    measure();
    update(false);
    expect(animations).toHaveLength(0);
    expect(renderer.root.findAll((node) => node.props.visible === true)).toHaveLength(0);
  });

  it('시트와 딤은 같은 진행값을 따르고 스프링이 범위를 넘어도 더 어두워지지 않는다', () => {
    measure();
    show();
    const nodes = renderer.root.findAll(
      (node) => typeof node.type !== 'string' && !!node.props.style,
    );
    const styles = nodes.map(
      (node) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>,
    );
    const dim = styles.find((style) => style.opacity !== undefined)!;
    const panel = styles.find((style) => style.transform !== undefined)!;
    const opacity = dim.opacity;
    const translateY = (panel.transform as { translateY: unknown }[])[0].translateY;
    act(() => animations[0].value.setValue(0.5));
    expect(read(opacity)).toBe(0.5);
    expect(read(translateY)).toBe(160);
    act(() => animations[0].value.setValue(1.1));
    expect(read(opacity)).toBe(1);
    expect(read(translateY)).toBe(0);
    act(() => animations[0].value.setValue(-0.1));
    expect(read(opacity)).toBe(0);
    expect(read(translateY)).toBe(320);
  });
});
